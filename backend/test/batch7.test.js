const test = require('node:test');
const assert = require('node:assert/strict');
const { EmployeesService } = require('../dist/employees/employees.service');
const { EmployeesController } = require('../dist/employees/employees.controller');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const ExcelJS = require('exceljs');

const hr = { userId: 'hr-1', role: 'ADMIN_HR' };
const employeeActor = { userId: 'user-1', role: 'KARYAWAN' };
const coordinator = { userId: 'coordinator-1', role: 'KOORDINATOR' };

function employee(overrides = {}) {
  return {
    id: 'employee-1', name: 'Employee', nik: 'nik-secret', employeeNumber: 'nip-secret', phone: 'phone-secret',
    address: 'address-secret', bankAccountNumber: 'bank-secret', dailyRate: 100000, contracts: [{ baseSalary: 9000000 }],
    email: 'employee@example.com', employmentType: 'TENAGA_BORONGAN', status: 'ACTIVE', joinDate: new Date('2026-01-01'),
    jobTitle: 'Staff', attendanceRequired: true, attendanceExemptionReason: null, coordinatorId: 'coordinator-1',
    createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), placements: [], user: { id: 'user-1' },
    ...overrides,
  };
}

test('Batch 7 employee endpoints apply explicit read and HR-only write roles', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.find360), ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR', 'KOMISARIS', 'KARYAWAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.export), ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR', 'DIREKTUR', 'KOMISARIS', 'MARKETING', 'KARYAWAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.import), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.bulkDeactivate), ['ADMIN_HR', 'SYSTEM_ADMIN']);
});

test('Batch 7 restricted employee projection omits PII, rates, and contracts', () => {
  const service = new EmployeesService({});
  const employee = {
    id: 'employee-1', name: 'Employee', nik: 'nik', employeeNumber: 'nip', phone: 'phone', address: 'address',
    bankAccountNumber: 'bank', dailyRate: 100000, contracts: [{ baseSalary: 1 }], email: 'email', dateOfBirth: new Date(),
    employmentType: 'TENAGA_BORONGAN', status: 'ACTIVE', joinDate: new Date(), jobTitle: 'Staff', attendanceRequired: true,
    attendanceExemptionReason: null, coordinatorId: 'coordinator-1', createdAt: new Date(), updatedAt: new Date(), placements: [],
  };
  const projected = service.present(employee, { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(projected.nik, undefined);
  assert.equal(projected.phone, undefined);
  assert.equal(projected.dailyRate, undefined);
  assert.equal(projected.contracts, undefined);
  assert.equal(projected.name, 'Employee');
});

test('360 view is self-scoped for KARYAWAN and never exposes rates or contracts', async () => {
  const service = new EmployeesService({ employee: { findUnique: async () => employee({
    attendances: [], leaveRequests: [], temporaryAssignments: [], absenceCases: [], overtimeRequests: [], profileChangeRequests: [],
  }) } });
  const result = await service.find360('employee-1', employeeActor);
  assert.equal(result.profile.id, 'employee-1');
  assert.equal(result.profile.dailyRate, undefined);
  assert.equal(result.profile.contracts, undefined);

  service.prisma.employee.findUnique = async () => employee({ user: { id: 'other-user' } });
  await assert.rejects(() => service.find360('employee-2', employeeActor), /profil sendiri/);
});

test('360 view denies a Coordinator outside the employee team', async () => {
  const service = new EmployeesService(
    { employee: { findUnique: async () => employee({ coordinatorId: 'coordinator-2' }) } },
    { assertEmployee: async () => { throw new Error('Karyawan tidak dalam tim Coordinator'); } },
  );
  await assert.rejects(() => service.find360('employee-1', coordinator), /dalam tim/);
});

test('employee listing clamps pagination and issues deterministic ordering queries', async () => {
  const queries = [];
  const prisma = {
    employee: {
      findMany: async (query) => { queries.push(query); return [employee()]; },
      count: async (query) => { queries.push(query); return 1; },
    },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new EmployeesService(prisma);
  const first = await service.findAll(hr, { page: 0, pageSize: 1000, sort: 'name', direction: 'asc' });
  const second = await service.findAll(hr, { page: 3, pageSize: -2, sort: 'unknown', direction: 'sideways' });

  assert.deepEqual(first.meta, { page: 1, pageSize: 100, total: 1 });
  assert.deepEqual(second.meta, { page: 3, pageSize: 1, total: 1 });
  assert.deepEqual(queries[0].orderBy, { name: 'asc' });
  assert.equal(queries[0].skip, 0);
  assert.equal(queries[0].take, 100);
  assert.deepEqual(queries[2].orderBy, { createdAt: 'desc' });
  assert.equal(queries[2].skip, 2);
  assert.equal(queries[2].take, 1);
});

test('employee import dry-run reports invalid and duplicate rows without writes', async () => {
  let transactionCalled = false;
  const service = new EmployeesService({
    employee: { findMany: async () => [{ nik: 'existing-nik', employeeNumber: 'existing-nip' }] },
    location: { findMany: async () => [] },
    $transaction: async () => { transactionCalled = true; },
  });
  const result = await service.import({ commit: true, rows: [
    { name: '', nik: 'existing-nik', employeeNumber: 'NIP-1', employmentType: 'INVALID', joinDate: 'not-a-date' },
    { name: 'Duplicate', nik: 'existing-nik', employeeNumber: 'NIP-1', employmentType: 'TENAGA_BORONGAN', joinDate: '2026-01-01' },
  ] }, hr);

  assert.equal(result.dryRun, true);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.row), [1, 2]);
  assert.match(result.errors[1].errors.join(' '), /NIK duplikat/);
  assert.match(result.errors[1].errors.join(' '), /NIP duplikat/);
  assert.equal(transactionCalled, false);
});

test('committed imports audit only a redacted batch summary', async () => {
  const audits = [];
  const service = new EmployeesService({
    employee: { findMany: async () => [] },
    location: { findMany: async () => [] },
    $transaction: async (callback) => callback({
      employee: { create: async () => ({ id: 'employee-1' }) },
      auditLog: { create: async ({ data }) => audits.push(data) },
    }),
  });
  const result = await service.import({ commit: true, rows: [{
    name: 'Imported', nik: 'nik-secret', employeeNumber: 'nip-secret', bankAccountNumber: 'bank-secret', dailyRate: 100000,
    employmentType: 'TENAGA_BORONGAN', joinDate: '2026-01-01',
  }] }, hr);

  assert.deepEqual(result, { dryRun: false, valid: true, created: 1, errors: [] });
  assert.equal(audits[0].action, 'EMPLOYEE_IMPORT');
  assert.deepEqual(audits[0].newValue, { rowCount: 1 });
  assert.doesNotMatch(JSON.stringify(audits[0]), /nik-secret|nip-secret|bank-secret|100000/);
});

test('employee export projects only its approved columns, not sensitive values', async () => {
  const service = new EmployeesService({});
  service.findAll = async () => ({ data: [employee({ placements: [{ location: { name: 'HQ' } }] })] });
  const exported = await service.export('xlsx', hr);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exported.buffer);
  const values = workbook.worksheets[0].getSheetValues().flat().filter((value) => value !== undefined).join(' ');

  assert.match(values, /Employee/);
  assert.match(values, /nip-secret/);
  assert.doesNotMatch(values, /nik-secret|phone-secret|address-secret|bank-secret|100000|9000000/);
});

test('bulk deactivation records the reason, reports each outcome, and lifecycle guards cannot be bypassed', async () => {
  const updates = [];
  const audits = [];
  const tx = {
    employee: {
      findUnique: async ({ where }) => where.id === 'missing' ? null : employee(),
      findFirst: async () => null,
      update: async ({ data }) => { updates.push(data); return employee({ ...data }); },
    },
    auditLog: { create: async ({ data }) => audits.push(data) },
    user: { updateMany: async () => ({ count: 0 }) },
  };
  const service = new EmployeesService({
    employee: { findUnique: async () => ({ status: 'RESIGNED' }) },
    $transaction: async (callback) => callback(tx),
  });
  const result = await service.bulkDeactivate({ employeeIds: ['employee-1', 'missing', 'employee-1'], reason: 'End of assignment' }, hr);
  assert.deepEqual(result, {
    results: [
      { employeeId: 'employee-1', success: true },
      { employeeId: 'missing', success: false, error: 'Karyawan tidak ditemukan' },
    ], deactivated: 1, failed: 1,
  });
  assert.equal(updates[0].status, 'INACTIVE');
  assert.equal(audits[0].reason, 'End of assignment');

  await assert.rejects(() => service.deactivate('employee-1', ' ', hr), /Alasan wajib/);
  await assert.rejects(() => service.reactivate('employee-1', 'Rehire attempt', hr), /memerlukan proses employment baru/);
  assert.equal(updates.length, 1);
});
