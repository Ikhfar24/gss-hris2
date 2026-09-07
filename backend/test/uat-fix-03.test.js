const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { OvertimeRequestsController } = require('../dist/overtime-requests/overtime-requests.controller');
const { OvertimeRequestsService } = require('../dist/overtime-requests/overtime-requests.service');
const { EmployeeProfileChangeRequestsController } = require('../dist/employee-profile-change-requests/employee-profile-change-requests.controller');

const coordinator = { userId: 'coordinator-1', email: 'coordinator@example.test', role: 'KOORDINATOR' };

function overtimeService() {
  const created = [];
  return {
    created,
    service: new OvertimeRequestsService({
      user: { findUnique: async () => ({ employeeId: 'employee-coordinator' }) },
      employee: { findUnique: async () => ({ id: 'employee-coordinator', status: 'ACTIVE', joinDate: new Date('2026-01-01') }) },
      overtimeRequest: { create: async ({ data }) => { created.push(data); return { ...data, id: 'overtime-1', employee: { id: data.employeeId, employmentType: 'TENAGA_BORONGAN' } }; } },
    }, { record: async () => undefined }, { queryWhere: async () => ({ employee: { employmentType: { in: [] } } }) }),
  };
}

test('UAT Fix Pack 03 allows a linked Coordinator to submit only their own overtime', async () => {
  const { service, created } = overtimeService();
  await service.create({ date: '2026-09-10', startTime: '2026-09-10T18:00:00', endTime: '2026-09-10T20:00:00', reason: 'Kebutuhan operasional' }, coordinator);
  assert.equal(created[0].employeeId, 'employee-coordinator');
  assert.equal(created[0].requestedById, 'coordinator-1');
});

test('UAT Fix Pack 03 ignores an arbitrary target and persists the linked Coordinator employee', async () => {
  const { service, created } = overtimeService();
  await service.create({ employeeId: 'employee-other', date: '2026-09-10', startTime: '2026-09-10T18:00:00', endTime: '2026-09-10T20:00:00', reason: 'Kebutuhan operasional' }, coordinator);
  assert.equal(created[0].employeeId, 'employee-coordinator');
});

test('UAT Fix Pack 03 authorizes Coordinator overtime route and keeps profile self-service Karyawan-only', () => {
  const overtimeRoles = Reflect.getMetadata('roles', OvertimeRequestsController.prototype.create);
  const profileRoles = Reflect.getMetadata('roles', EmployeeProfileChangeRequestsController.prototype.create);
  assert.deepEqual(overtimeRoles, ['KARYAWAN', 'KOORDINATOR']);
  assert.deepEqual(profileRoles, ['KARYAWAN']);
});

test('UAT Fix Pack 03 keeps Finance and Marketing out of profile self-service', () => {
  const profileRoles = Reflect.getMetadata('roles', EmployeeProfileChangeRequestsController.prototype.create);
  for (const role of ['KOORDINATOR', 'KEUANGAN', 'MARKETING']) assert.equal(profileRoles.includes(role), false);
  assert.deepEqual(profileRoles, ['KARYAWAN']);
});

test('UAT Fix Pack 03 exposes the Coordinator overtime route and role-aware profile menu', () => {
  const overtimePage = fs.readFileSync('../frontend/app/(dashboard)/overtime-requests/page.tsx', 'utf8');
  const layout = fs.readFileSync('../frontend/app/(dashboard)/layout.tsx', 'utf8');
  const roleGate = fs.readFileSync('../frontend/components/RoleGate.tsx', 'utf8');
  const dashboard = fs.readFileSync('../frontend/app/(dashboard)/dashboard/page.tsx', 'utf8');
  const placement = fs.readFileSync('../frontend/app/(dashboard)/placement-requests/page.tsx', 'utf8');
  assert.match(overtimePage, /role === 'KARYAWAN' \|\| role === 'KOORDINATOR'/);
  assert.match(layout, /allow=\{\['KARYAWAN', 'ADMIN_HR', 'SYSTEM_ADMIN'\]\}/);
  assert.doesNotMatch(layout, /allow=\{\['KOORDINATOR', 'KEUANGAN', 'MARKETING'\]\}/);
  assert.match(layout, /<RoleGate role=\{user\?\.role\}/);
  assert.doesNotMatch(roleGate, /getUser/);
  assert.match(dashboard, /const \[authResolved, setAuthResolved\] = useState\(false\)/);
  assert.match(dashboard, /!authResolved \? 'Memuat dashboard\.\.\.'/);
  assert.doesNotMatch(dashboard, /useState<SessionUser \| null>\(\(\) => getUser\(\)\)/);
  assert.match(placement, /const \[authResolved, setAuthResolved\] = useState\(false\)/);
  assert.match(placement, /Array\.isArray\(emps\) \? emps : Array\.isArray\(emps\.data\) \? emps\.data : null/);
  assert.match(placement, /setEmployees\(\[\]\)/);
  assert.match(placement, /Tidak ada karyawan dalam cakupan Anda/);
  assert.doesNotMatch(placement, /apiFetch<EmployeeOption\[\]>\('\/employees'/);
});

test('UAT Fix Pack 03 preserves CoordinatorScope-based overtime monitoring', async () => {
  let where;
  const service = new OvertimeRequestsService({
    user: { findUnique: async () => ({ employeeId: 'employee-coordinator' }) },
    overtimeRequest: { findMany: async (args) => { where = args.where; return []; } },
  }, {}, { queryWhere: async () => ({ employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } }) });
  await service.findAll(coordinator);
  assert.deepEqual(where.OR[0], { employeeId: 'employee-coordinator' });
  assert.deepEqual(where.OR[1], { employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } });
});
