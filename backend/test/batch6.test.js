const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { plainToInstance } = require('class-transformer');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { PayrollController } = require('../dist/payroll/payroll.controller');
const { PayrollAdminService } = require('../dist/payroll-admin/payroll-admin.service');
const { PayrollAdminController } = require('../dist/payroll-admin/payroll-admin.controller');
const { ReasonDto, RecordPaymentDto } = require('../dist/payroll/dto/payroll-workflow.dto');
const { CreateLineItemDto } = require('../dist/payroll/dto/create-line-item.dto');
const { CreatePayrollRevisionDto, RevisionActionDto } = require('../dist/payroll-admin/dto/payroll-admin.dto');
const { validatePayrollCycleDays, canCreatePayrollRevision } = require('../dist/common/domain/payroll-foundation');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

const finance = { userId: 'finance-1', role: 'KEUANGAN' };
const hr = { userId: 'hr-1', role: 'ADMIN_HR' };
const director = { userId: 'director-1', role: 'DIREKTUR' };
const employee = { userId: 'employee-user-1', role: 'KARYAWAN' };
const auditLog = { record: async () => {} };

async function invalidProperty(Type, value, property) {
  const errors = await validate(plainToInstance(Type, value));
  assert.ok(errors.some((error) => error.property === property), `${Type.name}.${property} must be required`);
}

test('Batch 6 payroll controllers separate Finance, HR monitoring, Director decisions, and employee self-service', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.createRun), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.findAll), ['KEUANGAN', 'ADMIN_HR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.review), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.submit), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.approve), ['DIREKTUR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.payment), ['KEUANGAN']);
  assert.equal(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.findMySlips), undefined);
  assert.equal(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.exportSlip), undefined);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollAdminController.prototype.createRevision), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollAdminController.prototype.approveRevision), ['DIREKTUR']);
});

test('payroll service enforces Finance, HR monitor-only, Director, and employee boundaries', async () => {
  const service = new PayrollService({ payrollRun: { findMany: async () => [] } }, auditLog);
  await assert.rejects(() => service.createRun({ periodStart: '2026-09-01', periodEnd: '2026-09-30' }, hr), /Keuangan/);
  await assert.rejects(() => service.review('run-1', employee), /Keuangan/);
  await assert.rejects(() => service.directorDecision('run-1', true, { reason: 'Approved' }, finance), /Direktur/);

  const monitor = await service.findAll(hr);
  assert.deepEqual(monitor, []);
});

test('payroll cycle functions and period creation honor configurable cross-month cycle days', async () => {
  assert.equal(validatePayrollCycleDays(26, 25), true);
  assert.equal(validatePayrollCycleDays(0, 25), false);
  assert.equal(validatePayrollCycleDays(1.5, 25), false);
  assert.equal(canCreatePayrollRevision('FINALIZED'), true);
  assert.equal(canCreatePayrollRevision('DRAFT'), false);

  let created;
  const service = new PayrollAdminService({
    payrollCycleSetting: { findUnique: async () => ({ id: 'cycle-1', startDay: 26, endDay: 25, isActive: true }) },
    payrollPeriod: {
      findFirst: async () => null,
      create: async ({ data }) => { created = data; return { id: 'period-1', ...data }; },
    },
  }, auditLog);
  await service.createPeriod({ cycleSettingId: 'cycle-1', periodStart: '2026-09-26', periodEnd: '2026-10-25' }, finance);
  assert.equal(created.cycleSettingId, 'cycle-1');
  assert.equal(created.periodStart.toISOString().slice(0, 10), '2026-09-26');
  assert.equal(created.periodEnd.toISOString().slice(0, 10), '2026-10-25');
  await assert.rejects(() => service.createPeriod({ cycleSettingId: 'cycle-1', periodStart: '2026-09-25', periodEnd: '2026-10-25' }, finance), /tidak sesuai/);
});

test('Borongan generation counts only PAYABLE attendance and snapshots its daily-rate result', async () => {
  const slips = [];
  const attendanceQueries = [];
  const prisma = {
    payrollRun: { create: async () => ({ id: 'run-1' }) },
    employee: { findMany: async () => [
      { id: 'daily-1', name: 'Borongan', employmentType: 'TENAGA_BORONGAN', dailyRate: 125000, contracts: [] },
    ] },
    attendance: { count: async ({ where }) => { attendanceQueries.push(where); return 4; } },
    payrollSlip: { create: async ({ data }) => slips.push(data) },
    leaveRequest: { findMany: async () => assert.fail('payroll generation must not adjust leave automatically') },
    overtimeRequest: { findMany: async () => assert.fail('payroll generation must not adjust overtime automatically') },
    absenceCase: { findMany: async () => assert.fail('payroll generation must not adjust absence automatically') },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const service = new PayrollService(prisma, auditLog);
  service.findOne = async () => ({ id: 'run-1', slips: [] });

  const result = await service.createRun({ periodStart: '2026-09-01', periodEnd: '2026-09-30' }, finance);
  assert.equal(attendanceQueries[0].payableStatus, 'PAYABLE');
  assert.deepEqual(slips, [{ payrollRunId: 'run-1', employeeId: 'daily-1', basis: 'DAILY_RATE', dailyRate: 125000, presentDays: 4, baseSalary: 500000, netPay: 500000 }]);
  assert.deepEqual(result.skipped, []);
});

test('payroll run date validation rejects inverted periods before persistence', async () => {
  let created = false;
  const service = new PayrollService({ payrollRun: { create: async () => { created = true; } } }, auditLog);
  await assert.rejects(() => service.createRun({ periodStart: '2026-10-01', periodEnd: '2026-09-30' }, finance), /selesai periode/);
  assert.equal(created, false);
});

test('workflow DTOs require reasons for payroll mutations and decisions', async () => {
  await invalidProperty(ReasonDto, {}, 'reason');
  await invalidProperty(RecordPaymentDto, { amount: 1, reference: 'TRF-1', paidAt: '2026-09-30' }, 'reason');
  await invalidProperty(CreateLineItemDto, { type: 'EARNING', label: 'Lembur', amount: 1 }, 'reason');
  await invalidProperty(CreatePayrollRevisionDto, { items: [] }, 'reason');
  await invalidProperty(RevisionActionDto, {}, 'note');
});

test('review, submit, and Director finalization lock the payroll snapshot against further line-item changes', async () => {
  const run = { id: 'run-1', status: 'DRAFT', financeReviewedAt: null };
  let transactionCalled = false;
  const service = new PayrollService({
    payrollRun: {
      findUnique: async () => run,
      update: async ({ data }) => Object.assign(run, data),
    },
    payrollSlip: { findUnique: async () => ({ id: 'slip-1', payrollRun: run }) },
    $transaction: async () => { transactionCalled = true; },
  }, auditLog);

  await service.review('run-1', finance);
  assert.equal(run.status, 'DRAFT');
  assert.equal(run.financeReviewedById, finance.userId);
  await service.submit('run-1', { reason: 'Ready for approval' }, finance);
  assert.equal(run.status, 'PENDING_DIRECTOR_APPROVAL');
  await service.directorDecision('run-1', true, { reason: 'Approved' }, director);
  assert.equal(run.status, 'FINALIZED');
  assert.equal(run.finalizedById, director.userId);
  await assert.rejects(() => service.addLineItem('slip-1', { type: 'EARNING', label: 'Late addition', amount: 1, reason: 'Correction' }, finance), /DRAFT/);
  assert.equal(transactionCalled, false);
});

test('payment is accepted only for finalized runs and never updates payroll totals', async () => {
  const run = { id: 'run-1', status: 'FINALIZED' };
  let runUpdated = false;
  let slipUpdated = false;
  let payment;
  const service = new PayrollService({
    payrollRun: { findUnique: async () => run, update: async () => { runUpdated = true; } },
    payrollSlip: { update: async () => { slipUpdated = true; } },
    payrollPayment: { create: async ({ data }) => { payment = data; return { id: 'payment-1', ...data }; } },
  }, auditLog);
  await service.recordPayment('run-1', { amount: 500000, reference: 'TRF-1', paidAt: '2026-09-30', reason: 'Transfer bank' }, finance);
  assert.equal(payment.payrollRunId, 'run-1');
  assert.equal(runUpdated, false);
  assert.equal(slipUpdated, false);
  run.status = 'DRAFT';
  await assert.rejects(() => service.recordPayment('run-1', { amount: 1, reference: 'TRF-2', paidAt: '2026-09-30', reason: 'Too early' }, finance), /setelah payroll final/);
});

test('revisions preserve finalized originals, require a reason, and move through Director approval without slip mutation', async () => {
  const run = { id: 'run-1', status: 'FINALIZED', slips: [{ id: 'slip-1', netPay: 500000 }] };
  const revision = { id: 'revision-1', payrollRunId: 'run-1', status: 'DRAFT', reason: 'Underpaid overtime', items: [] };
  let revisionCreate;
  let slipUpdated = false;
  const service = new PayrollAdminService({
    payrollRun: { findUnique: async () => run },
    payrollRevision: {
      aggregate: async () => ({ _max: { revisionNumber: 2 } }),
      create: async ({ data }) => { revisionCreate = data; Object.assign(revision, data); return revision; },
      findUnique: async () => revision,
      update: async ({ data }) => Object.assign(revision, data),
    },
    payrollSlip: { update: async () => { slipUpdated = true; } },
  }, auditLog);

  await assert.rejects(() => service.createRevision('run-1', { reason: 'Missing items', items: [] }, finance), /minimal satu item/);
  await service.createRevision('run-1', { reason: 'Underpaid overtime', items: [{ payrollSlipId: 'slip-1', type: 'EARNING', label: 'Lembur', amount: 25000, reason: 'Approved timesheet' }] }, finance);
  assert.equal(revisionCreate.reason, 'Underpaid overtime');
  assert.equal(revisionCreate.netAdjustment, 25000);
  assert.deepEqual(revisionCreate.items.create[0].previousValue, { netPay: 500000 });
  assert.deepEqual(revisionCreate.items.create[0].newValue, { netPay: 525000 });
  assert.equal(slipUpdated, false);
  await service.submitRevision('revision-1', finance);
  assert.equal(revision.status, 'PENDING_DIRECTOR_APPROVAL');
  await service.approveRevision('revision-1', { note: 'Approved correction' }, director);
  assert.equal(revision.status, 'APPROVED');
  assert.equal(revision.directorApprovedById, director.userId);
  await service.finalizeRevision('revision-1', finance);
  assert.equal(revision.status, 'FINALIZED');
  assert.equal(slipUpdated, false);
});
