const test = require('node:test');
const assert = require('node:assert/strict');

const { PayrollService } = require('../dist/payroll/payroll.service');
const { PayrollAdminService } = require('../dist/payroll-admin/payroll-admin.service');
const { OvertimeRequestsService } = require('../dist/overtime-requests/overtime-requests.service');
const { TemporaryAssignmentsService } = require('../dist/temporary-assignments/temporary-assignments.service');
const { EmployeeProfileChangeRequestsService } = require('../dist/employee-profile-change-requests/employee-profile-change-requests.service');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');

const finance = { userId: 'finance-1', email: 'finance@test', name: 'Finance', role: 'KEUANGAN' };
const director = { userId: 'director-1', email: 'director@test', name: 'Direktur', role: 'DIREKTUR' };
const hr = { userId: 'hr-1', email: 'hr@test', name: 'HR', role: 'ADMIN_HR' };
const auditLog = { record: async () => ({}) };

// ─── Payroll run transitions ─────────────────────────────────────────

test('payroll review loser of a concurrent review is rejected', async () => {
  const service = new PayrollService({
    payrollRun: {
      findUnique: async () => ({ id: 'run-1', status: 'DRAFT' }),
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => service.review('run-1', finance), /tidak dapat direview/);
});

test('payroll submit loser of a concurrent submit is rejected', async () => {
  const service = new PayrollService({
    payrollRun: {
      findUnique: async () => ({ id: 'run-1', status: 'DRAFT', financeReviewedAt: new Date() }),
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => service.submit('run-1', { reason: 'Kirim' }, finance), /harus direview Keuangan/);
});

test('payroll double-approve by Direktur has a single winner', async () => {
  const loser = new PayrollService({
    payrollRun: {
      findUnique: async () => ({ id: 'run-1', status: 'PENDING_DIRECTOR_APPROVAL' }),
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => loser.directorDecision('run-1', true, { reason: 'Setuju' }, director), /berubah/);

  let audited = false;
  const winner = new PayrollService({
    payrollRun: {
      findUnique: async () => ({ id: 'run-1', status: 'PENDING_DIRECTOR_APPROVAL' }),
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ id: 'run-1', status: 'FINALIZED' }),
    },
  }, { record: async () => { audited = true; } });
  const result = await winner.directorDecision('run-1', true, { reason: 'Setuju' }, director);
  assert.equal(result.status, 'FINALIZED');
  assert.equal(audited, true);
});

// ─── Payroll revision / period transitions ───────────────────────────

test('payroll revision submit loser is rejected', async () => {
  const revision = { id: 'rev-1', status: 'DRAFT', reason: 'Koreksi', payrollRunId: 'run-1' };
  const service = new PayrollAdminService({
    payrollRevision: {
      findUnique: async () => revision,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => service.submitRevision('rev-1', finance), /berubah/);
});

test('payroll revision approve-vs-reject race has a single winner', async () => {
  const revision = { id: 'rev-1', status: 'PENDING_DIRECTOR_APPROVAL', reason: 'Koreksi', payrollRunId: 'run-1' };
  const service = new PayrollAdminService({
    payrollRevision: {
      findUnique: async () => revision,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => service.approveRevision('rev-1', { note: 'Setuju' }, director), /berubah/);
});

test('payroll period double-close has a single winner', async () => {
  const period = { id: 'period-1', status: 'OPEN', payrollRun: null };
  const service = new PayrollAdminService({
    payrollPeriod: {
      findUnique: async () => period,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog);
  await assert.rejects(() => service.closePeriod('period-1', finance), /berubah/);
});

// ─── Overtime transitions ────────────────────────────────────────────

test('overtime review loser is rejected with a conflict', async () => {
  const request = { id: 'overtime-1', employeeId: 'employee-1', requestedById: 'user-9', status: 'PENDING', reason: 'Lembur', employee: {} };
  const service = new OvertimeRequestsService({
    overtimeRequest: {
      findUnique: async () => request,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog, {});
  await assert.rejects(() => service.review('overtime-1', { approve: false, note: 'Tolak' }, hr), /berubah/);
});

test('overtime cancel loser is rejected with a conflict', async () => {
  const request = { id: 'overtime-1', employeeId: 'employee-1', requestedById: 'user-9', status: 'PENDING', reason: 'Lembur', employee: {} };
  const service = new OvertimeRequestsService({
    overtimeRequest: {
      findUnique: async () => request,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog, {});
  await assert.rejects(() => service.cancel('overtime-1', hr), /pembatalan/);
});

// ─── Temporary assignment transitions ────────────────────────────────

test('temporary assignment review loser is rejected with a conflict', async () => {
  const assignment = { id: 'temp-1', status: 'PENDING', reason: 'Butuh bantuan', createdById: 'hr-1' };
  const service = new TemporaryAssignmentsService({
    temporaryAssignment: {
      findUnique: async () => assignment,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog, {});
  await assert.rejects(() => service.review('temp-1', { approve: false, note: 'Tolak' }, hr), /berubah/);
});

test('temporary assignment double-complete has a single winner', async () => {
  const assignment = { id: 'temp-1', status: 'APPROVED', reason: 'Selesai', endDate: new Date('2020-01-02') };
  const service = new TemporaryAssignmentsService({
    temporaryAssignment: {
      findUnique: async () => assignment,
      updateMany: async () => ({ count: 0 }),
    },
  }, auditLog, {});
  await assert.rejects(() => service.complete('temp-1', { reason: 'Selesai' }, hr), /berubah/);
});

// ─── Profile change review ───────────────────────────────────────────

test('profile change double-review has a single winner', async () => {
  const tx = {
    employeeProfileChangeRequest: {
      findUnique: async () => ({ id: 'pcr-1', status: 'PENDING', requestedChanges: { proposed: { phone: '08123456789' } }, employeeId: 'emp-1' }),
      updateMany: async () => ({ count: 0 }),
    },
  };
  const service = new EmployeeProfileChangeRequestsService({ $transaction: async (cb) => cb(tx) });
  await assert.rejects(() => service.review('pcr-1', { decision: 'APPROVED' }, hr), /berubah/);
});

// ─── Leave transitions ───────────────────────────────────────────────

function leaveTx(overrides = {}) {
  return {
    leaveApproval: { create: async () => ({}) },
    leaveRequest: {
      updateMany: async () => ({ count: 0 }),
      findUniqueOrThrow: async () => { throw new Error('must not be reached by loser'); },
      ...overrides.leaveRequest,
    },
    auditLog: { create: async () => ({}) },
  };
}

test('leave review loser of a concurrent decision is rejected', async () => {
  const request = {
    id: 'leave-1', status: 'PENDING_HR', type: 'CUTI', employeeId: 'emp-1',
    startDate: new Date('2026-09-07'), employee: { employmentType: 'TENAGA_BORONGAN' }, approvals: [], documentUrl: null,
  };
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (cb) => cb(leaveTx()),
  }, {});
  await assert.rejects(() => service.review('leave-1', { approve: false, note: 'Tolak' }, hr), /berubah/);
});

test('leave cancel loser of a concurrent decision is rejected', async () => {
  const request = {
    id: 'leave-1', status: 'PENDING_HR', type: 'CUTI', employeeId: 'emp-1',
    employee: { employmentType: 'TENAGA_BORONGAN' }, approvals: [], documentUrl: null,
  };
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (cb) => cb(leaveTx()),
  }, {});
  await assert.rejects(() => service.cancel('leave-1', hr), /pembatalan/);
});

test('resign finalization is idempotent under concurrency', async () => {
  const request = {
    id: 'resign-1', type: 'RESIGN', status: 'APPROVED', employeeId: 'emp-1',
    startDate: new Date('2020-01-01'), employee: {}, documentUrl: null,
  };
  const alreadyDone = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (cb) => cb({ employee: { findUnique: async () => ({ status: 'RESIGNED' }) } }),
  }, {});
  await assert.rejects(() => alreadyDone.finalizeResignation('resign-1', hr), /sudah difinalisasi/);

  const racer = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (cb) => cb({ employee: { findUnique: async () => ({ status: 'ACTIVE' }), updateMany: async () => ({ count: 0 }) } }),
  }, {});
  await assert.rejects(() => racer.finalizeResignation('resign-1', hr), /sudah difinalisasi/);
});
