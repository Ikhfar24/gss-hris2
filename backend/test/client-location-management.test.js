const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { LocationsController } = require('../dist/locations/locations.controller');
const { LocationsService } = require('../dist/locations/locations.service');

const hr = { userId: 'hr-1', email: 'hr@example.test', role: 'ADMIN_HR' };
const otherRoles = ['SYSTEM_ADMIN', 'KOORDINATOR', 'KARYAWAN', 'MARKETING', 'KEUANGAN', 'DIREKTUR', 'KOMISARIS'];

test('Client and Location mutation endpoints are ADMIN_HR-only', () => {
  for (const controller of [ClientsController, LocationsController]) {
    for (const method of ['create', 'update', 'remove', 'forceDelete', 'importCommit']) {
      assert.deepEqual(Reflect.getMetadata(ROLES_KEY, controller.prototype[method]), ['ADMIN_HR']);
    }
    for (const method of ['importTemplate', 'importPreview']) {
      assert.deepEqual(Reflect.getMetadata(ROLES_KEY, controller.prototype[method]), ['ADMIN_HR', 'SYSTEM_ADMIN']);
    }
  }
});

test('Client and Location services reject every non-ADMIN_HR actor before writes', async () => {
  const prisma = { $transaction: async () => assert.fail('unauthorized actor entered transaction') };
  const clients = new ClientsService(prisma, {});
  const locations = new LocationsService(prisma, {});
  for (const role of otherRoles) {
    const actor = { userId: `user-${role}`, role };
    await assert.rejects(() => clients.create({ name: 'Client' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => clients.update('client-1', { name: 'Client' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => clients.remove('client-1', 'Required reason', actor), /Hanya Admin HR/);
    await assert.rejects(() => clients.forceDelete('client-1', 'Required reason', actor), /Hanya Admin HR/);
    await assert.rejects(() => clients.commitImport({}, actor), /Hanya Admin HR/);
    await assert.rejects(() => locations.create({ name: 'Location' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => locations.update('location-1', { name: 'Location' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => locations.remove('location-1', 'Required reason', actor), /Hanya Admin HR/);
    await assert.rejects(() => locations.forceDelete('location-1', 'Required reason', actor), /Hanya Admin HR/);
    await assert.rejects(() => locations.commitImport({}, actor), /Hanya Admin HR/);
  }
});

test('normal Client deletion physically removes a pristine record and rejects relation blockers', async () => {
  const calls = [];
  let client = { id: 'client-1', name: 'Pristine', clientId: null, _count: { locations: 0, payrollCycleSettings: 0, temporaryAssignments: 0 } };
  const tx = {
    client: {
      findFirst: async () => client,
      delete: async (args) => calls.push(['delete', args]),
    },
    auditLog: { create: async ({ data }) => calls.push(['audit', data]) },
  };
  const service = new ClientsService({ $transaction: async (callback) => callback(tx) }, {});
  assert.deepEqual(await service.remove('client-1', 'Duplicate test record', hr), { deleted: true, strategy: 'PHYSICAL_PRISTINE_DELETE' });
  assert.deepEqual(calls.map(([name]) => name), ['audit', 'delete']);

  client = { ...client, _count: { ...client._count, locations: 1 } };
  await assert.rejects(() => service.remove('client-1', 'Has location', hr), /Gunakan Force Delete/);
});

test('force deleting a Client tombstones it and disables payroll scope without detaching history', async () => {
  const calls = [];
  const client = { id: 'client-1', employeeId: null, name: 'Historical', isActive: true, _count: { locations: 4, payrollCycleSettings: 1, temporaryAssignments: 8 } };
  const tx = {
    client: {
      findFirst: async () => client,
      update: async (args) => calls.push(['client.update', args]),
    },
    payrollCycleSetting: { updateMany: async (args) => calls.push(['payrollCycleSetting.updateMany', args]) },
    auditLog: { create: async ({ data }) => calls.push(['auditLog.create', data]) },
  };
  const service = new ClientsService({ $transaction: async (callback) => callback(tx) }, {});
  assert.deepEqual(await service.forceDelete('client-1', 'Retire historical client', hr), { deleted: true, strategy: 'TOMBSTONE' });
  assert.deepEqual(calls.map(([name]) => name), ['payrollCycleSetting.updateMany', 'client.update', 'auditLog.create']);
  assert.equal(calls[1][1].data.isActive, false);
  assert.ok(calls[1][1].data.deletedAt instanceof Date);
  assert.equal(calls[2][1].newValue.dependencies.locations, 4);
});

test('normal Location deletion rejects history while force deletion retires live operations and preserves rows', async () => {
  const calls = [];
  const location = {
    id: 'location-1', clientId: 'client-1', name: 'Historical', isActive: true,
    _count: { placements: 2, placementRequestsFrom: 1, placementRequestsTo: 2, attendances: 30, holidays: 3, payrollCycleSettings: 1, temporaryAssignments: 4 },
  };
  const tx = {
    location: {
      findFirst: async () => location,
      update: async (args) => calls.push(['location.update', args]),
      delete: async () => assert.fail('historical Location must not be physically deleted'),
    },
    placement: { updateMany: async (args) => calls.push(['placement.updateMany', args]) },
    placementRequest: { updateMany: async (args) => calls.push(['placementRequest.updateMany', args]) },
    temporaryAssignment: { updateMany: async (args) => calls.push(['temporaryAssignment.updateMany', args]) },
    payrollCycleSetting: { updateMany: async (args) => calls.push(['payrollCycleSetting.updateMany', args]) },
    auditLog: { create: async ({ data }) => calls.push(['auditLog.create', data]) },
  };
  const service = new LocationsService({ $transaction: async (callback) => callback(tx) }, {});
  await assert.rejects(() => service.remove('location-1', 'Unsafe physical deletion', hr), /Gunakan Force Delete/);
  assert.deepEqual(await service.forceDelete('location-1', 'Retire operational location', hr), { deleted: true, strategy: 'TOMBSTONE' });
  assert.deepEqual(calls.map(([name]) => name), [
    'placement.updateMany', 'placement.updateMany', 'placementRequest.updateMany',
    'temporaryAssignment.updateMany', 'payrollCycleSetting.updateMany', 'location.update', 'auditLog.create',
  ]);
  assert.equal(calls[5][1].data.isActive, false);
  assert.equal(calls[6][1].newValue.dependencies.attendances, 30);
});

test('operational reads exclude tombstoned Clients and Locations', async () => {
  const queries = {};
  const clients = new ClientsService({ client: { findMany: async (args) => { queries.clients = args; return []; } } }, {});
  const locations = new LocationsService({ location: { findMany: async (args) => { queries.locations = args; return []; } } }, {});
  await clients.findAll();
  await locations.findAll();
  assert.deepEqual(queries.clients.where, { deletedAt: null });
  assert.deepEqual(queries.locations.where, { deletedAt: null });
});

test('responsive management UI uses dialogs, action menus, ADMIN_HR gating, and deferred photo upload', () => {
  const clients = fs.readFileSync('../frontend/app/(dashboard)/clients/page.tsx', 'utf8');
  const locations = fs.readFileSync('../frontend/app/(dashboard)/locations/page.tsx', 'utf8');
  const profile = fs.readFileSync('../frontend/components/management/ManagementEmployeeProfile.tsx', 'utf8');
  assert.match(clients, /canManage = session\.role === 'ADMIN_HR'/);
  assert.match(clients, /Tindakan untuk client/);
  assert.match(clients, /<Dialog open=\{!!editing\}/);
  assert.match(clients, /\/force-delete/);
  assert.match(clients, /Cari client/);
  assert.match(locations, /canManage = session\.role === 'ADMIN_HR'/);
  assert.match(locations, /Tindakan untuk lokasi/);
  assert.match(locations, /<Dialog open=\{!!editing\}/);
  assert.match(locations, /Cari lokasi/);
  assert.match(profile, /URL\.createObjectURL\(photo\)/);
  assert.match(profile, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(profile, /data-testid="profile-photo-input"/);
  assert.match(profile, /await apiFetch\(`\/employees\/\$\{profile\.id\}`[\s\S]*await uploadFile\(`\/employees\/\$\{profile\.id\}\/profile-photo`/);
});
