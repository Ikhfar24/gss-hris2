const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const { UsersService } = require('../dist/users/users.service');
const { EmployeesService } = require('../dist/employees/employees.service');
const { EmployeeProfileChangeRequestsService } = require('../dist/employee-profile-change-requests/employee-profile-change-requests.service');
const { EmployeesController } = require('../dist/employees/employees.controller');
const { UsersController } = require('../dist/users/users.controller');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

test('Batch 3 schema has inactive employment state and actor-role audit metadata', () => {
  const employeeStatus = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === 'EmployeeStatus');
  const audit = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'AuditLog');
  assert.ok(employeeStatus.values.some((value) => value.name === 'INACTIVE'));
  assert.ok(audit.fields.some((field) => field.name === 'actorRole'));
});

test('resigned employee-linked user cannot be reactivated', async () => {
  const service = new UsersService({
    user: { findUnique: async () => ({ id: 'u1', employeeId: 'e1', name: 'User', email: 'u@example.test', role: 'KARYAWAN', isActive: false, employee: { status: 'RESIGNED' } }) },
  });
  await assert.rejects(() => service.update('u1', { isActive: true, reason: 'Aktifkan ulang' }, { userId: 'hr1', role: 'ADMIN_HR' }));
});

test('sensitive employee edits require a reason', async () => {
  const service = new EmployeesService({
    employee: { findUnique: async () => ({ id: 'e1', status: 'ACTIVE', attendanceRequired: true, attendanceExemptionReason: null }) },
  });
  await assert.rejects(() => service.update('e1', { status: 'INACTIVE' }, { userId: 'hr1', role: 'ADMIN_HR' }));
});

test('Marketing projection excludes bank, BPJS, salary, and contracts', () => {
  const service = new EmployeesService({});
  const response = service.present({ id: 'e1', name: 'Employee', bankAccountNumber: 'secret', bpjsKesehatanNumber: 'bpjs', bpjsKetenagakerjaanNumber: 'bpjs2', dailyRate: 100000, contracts: [{ baseSalary: 1 }], placements: [] }, { userId: 'm1', role: 'MARKETING' });
  assert.equal('bankAccountNumber' in response, false);
  assert.equal('bpjsKesehatanNumber' in response, false);
  assert.equal('dailyRate' in response, false);
  assert.equal('contracts' in response, false);
});

test('employee self-service projection excludes rate and contract compensation data', () => {
  const service = new EmployeesService({});
  const response = service.present({ id: 'e1', name: 'Employee', dailyRate: 100000, contracts: [{ baseSalary: 1000000 }], bankAccountNumber: 'own-bank' }, { userId: 'u1', role: 'KARYAWAN' });
  assert.equal('dailyRate' in response, false);
  assert.equal('contracts' in response, false);
  assert.equal(response.bankAccountNumber, 'own-bank');
});

test('employee audit projection omits raw identity, bank, BPJS, and rate values', () => {
  const service = new EmployeesService({});
  const response = service.auditProjection({ id: 'e1', nik: 'nik', employeeNumber: 'nip', bankAccountNumber: 'bank', bpjsKesehatanNumber: 'bpjs1', bpjsKetenagakerjaanNumber: 'bpjs2', dailyRate: 100000, name: 'Employee' });
  assert.deepEqual(response, { id: 'e1', name: 'Employee' });
});

test('profile change request rejects restricted arbitrary fields', async () => {
  const service = new EmployeeProfileChangeRequestsService({
    user: { findUnique: async () => ({ employeeId: 'e1' }) },
    employee: { findUnique: async () => ({ id: 'e1', address: 'old' }) },
  });
  await assert.rejects(() => service.create({ changes: { employmentType: 'TENAGA_ARSIPARIS' }, reason: 'Ubah' }, { userId: 'u1', role: 'KARYAWAN' }));
});

test('profile change approval schema retains a historical decision record', () => {
  const request = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'EmployeeProfileChangeRequest');
  assert.ok(request.fields.some((field) => field.name === 'requestedChanges'));
  assert.ok(request.fields.some((field) => field.name === 'appliedChanges'));
  assert.ok(request.fields.some((field) => field.name === 'reviewedById'));
});

test('Coordinator, Finance, and Commissioner cannot mutate employee master through controller RBAC', () => {
  const roles = Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.update);
  assert.equal(roles.includes('KOORDINATOR'), false);
  assert.equal(roles.includes('KEUANGAN'), false);
  assert.equal(roles.includes('KOMISARIS'), false);
  assert.equal(roles.includes('ADMIN_HR'), true);
});

test('Director can monitor users but cannot mutate user lifecycle through controller RBAC', () => {
  const readRoles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAll);
  const writeRoles = Reflect.getMetadata(ROLES_KEY, UsersController.prototype.update);
  assert.equal(readRoles.includes('DIREKTUR'), true);
  assert.equal(writeRoles.includes('DIREKTUR'), false);
});

test('a user with protected audit history cannot be hard deleted', async () => {
  const service = new UsersService({
    user: { findUnique: async () => ({ id: 'u1', employeeId: null, name: 'User', email: 'u@example.test', role: 'KARYAWAN', isActive: true, employee: null }) },
    auditLog: { count: async () => 1 },
  });
  await assert.rejects(() => service.remove('u1', 'Duplikat', { userId: 'hr1', role: 'ADMIN_HR' }));
});

test('employee attendance requirement remains independent from user role', () => {
  const service = new EmployeesService({});
  const exempt = service.present({ id: 'e1', attendanceRequired: false, attendanceExemptionReason: 'Director exempt' }, { userId: 'd1', role: 'DIREKTUR' });
  assert.equal(exempt.attendanceRequired, false);
});
