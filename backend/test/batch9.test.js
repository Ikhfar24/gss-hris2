const test = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
const { EmployeesService } = require('../dist/employees/employees.service');
const { EmployeesController } = require('../dist/employees/employees.controller');
const { PayrollController } = require('../dist/payroll/payroll.controller');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { PayrollAdminService } = require('../dist/payroll-admin/payroll-admin.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const { MediaService } = require('../dist/media/media.service');
const { isPayableAttendance } = require('../dist/common/domain/attendance-payable');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

const finance = { userId: 'finance-1', role: 'KEUANGAN' };
const director = { userId: 'director-1', role: 'DIREKTUR' };
const auditLog = { record: async () => {} };

test('Batch 9 deliverables exist', () => {
  assert.equal(existsSync('../FUNCTIONAL_REVISION_REPORT.md'), true);
  assert.equal(existsSync('../MANUAL_TEST_CHECKLIST.md'), true);
  assert.equal(existsSync('../OPEN_QUESTIONS_AFTER_REVISION.md'), true);
});

test('RBAC and restricted employee projections protect payroll and sensitive fields', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.createRun), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.approve), ['DIREKTUR']);
  assert.equal(Reflect.getMetadata(ROLES_KEY, EmployeesController.prototype.update).includes('MARKETING'), false);
  const projected = new EmployeesService({}).present({
    id: 'employee-1', name: 'Employee', nik: 'secret-nik', bankAccountNumber: 'secret-bank',
    dailyRate: 100000, contracts: [{ baseSalary: 9000000 }], placements: [],
  }, { userId: 'marketing-1', role: 'MARKETING' });
  assert.equal(projected.nik, undefined);
  assert.equal(projected.bankAccountNumber, undefined);
  assert.equal(projected.dailyRate, undefined);
  assert.equal(projected.contracts, undefined);
});

test('only completed, approved, non-system attendance is payable', () => {
  const checkInAt = new Date('2026-09-07T08:00:00Z');
  const checkOutAt = new Date('2026-09-07T16:00:00Z');
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'VALID', checkOutSource: 'EMPLOYEE' }), true);
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'NEEDS_REVIEW', checkOutSource: 'EMPLOYEE' }), false);
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'APPROVED_AFTER_REVIEW', checkOutSource: 'SYSTEM_AUTO_CLOSED' }), false);
});

test('final payroll locks line items and revisions preserve the finalized original', async () => {
  const run = { id: 'run-1', status: 'FINALIZED', slips: [{ id: 'slip-1', netPay: 500000 }] };
  const payroll = new PayrollService({ payrollSlip: { findUnique: async () => ({ id: 'slip-1', payrollRun: run }) } }, auditLog);
  await assert.rejects(() => payroll.addLineItem('slip-1', { type: 'EARNING', label: 'Adjustment', amount: 1, reason: 'Correction' }, finance), /DRAFT/);

  let slipUpdated = false;
  const revision = { id: 'revision-1', payrollRunId: 'run-1', status: 'DRAFT', items: [] };
  const revisions = new PayrollAdminService({
    payrollRun: { findUnique: async () => run },
    payrollRevision: {
      aggregate: async () => ({ _max: { revisionNumber: 0 } }),
      create: async ({ data }) => Object.assign(revision, data),
      findUnique: async () => revision,
      update: async ({ data }) => Object.assign(revision, data),
    },
    payrollSlip: { update: async () => { slipUpdated = true; } },
  }, auditLog);
  await revisions.createRevision('run-1', { reason: 'Correct source record', items: [{ payrollSlipId: 'slip-1', type: 'EARNING', label: 'Adjustment', amount: 25000, reason: 'Verified' }] }, finance);
  assert.deepEqual(revision.items.create[0].previousValue, { netPay: 500000 });
  assert.deepEqual(revision.items.create[0].newValue, { netPay: 525000 });
  await revisions.submitRevision('revision-1', finance);
  await revisions.approveRevision('revision-1', { note: 'Approved' }, director);
  await revisions.finalizeRevision('revision-1', finance);
  assert.equal(revision.status, 'FINALIZED');
  assert.equal(slipUpdated, false);
});

test('dashboard attention returns scoped, minimal card metadata', async () => {
  const dashboard = new DashboardService({ payrollRun: { count: async () => 2 }, payrollRevision: { count: async () => 1 } });
  const cards = await dashboard.attention(finance);
  assert.deepEqual(cards, [
    { key: 'payroll-draft', label: 'Payroll draft perlu diproses', count: 2, href: '/payroll' },
    { key: 'payroll-revision-draft', label: 'Revisi payroll draft perlu diproses', count: 1, href: '/payroll' },
  ]);
  for (const card of cards) assert.deepEqual(Object.keys(card).sort(), ['count', 'href', 'key', 'label']);
});

test('protected media derives paths from stored evidence and denies unrelated employees', async () => {
  const media = new MediaService({ user: { findUnique: async () => ({ employeeId: 'employee-2' }) } });
  assert.deepEqual(media.mediaPaths('selfies', 'employee-1', 'check-in.jpg'), ['/uploads/selfies/employee-1/check-in.jpg', '/api/v1/media/selfies/employee-1/check-in.jpg']);
  await assert.rejects(() => media.assertAccess('employee-1', 'coordinator-1', { userId: 'user-2', role: 'KARYAWAN' }));
  await media.assertAccess('employee-1', 'coordinator-1', { userId: 'coordinator-1', role: 'KOORDINATOR' });
});

test('employee import audits a redacted summary rather than source PII or compensation', async () => {
  const audits = [];
  const service = new EmployeesService({
    employee: { findMany: async () => [] }, location: { findMany: async () => [] },
    $transaction: async (callback) => callback({ employee: { create: async () => ({ id: 'employee-1' }) }, auditLog: { create: async ({ data }) => audits.push(data) } }),
  });
  const result = await service.import({ commit: true, rows: [{ name: 'Imported', nik: 'secret-nik', employeeNumber: 'secret-nip', bankAccountNumber: 'secret-bank', dailyRate: 100000, employmentType: 'TENAGA_BORONGAN', joinDate: '2026-09-01' }] }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.deepEqual(result, { dryRun: false, valid: true, created: 1, errors: [] });
  assert.deepEqual(audits[0].newValue, { rowCount: 1 });
  assert.doesNotMatch(JSON.stringify(audits[0]), /secret-nik|secret-nip|secret-bank|100000/);
});
