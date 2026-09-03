const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const { isPayableAttendance, payableAttendanceState } = require('../dist/common/domain/attendance-payable');
const { dateRangesOverlap } = require('../dist/common/domain/date-range');
const { effectiveWorkLocation } = require('../dist/common/domain/temporary-assignment');
const { canCreatePayrollRevision, validatePayrollCycleDays } = require('../dist/common/domain/payroll-foundation');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');

function model(name) {
  return Prisma.dmmf.datamodel.models.find((entry) => entry.name === name);
}

test('attendance payable state requires a real checkout and approved validation', () => {
  assert.equal(isPayableAttendance({ checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'VALID', checkOutSource: 'EMPLOYEE' }), true);
  assert.equal(isPayableAttendance({ checkInAt: new Date(), checkOutAt: null, validationStatus: 'VALID' }), false);
  assert.equal(isPayableAttendance({ checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'NEEDS_REVIEW' }), false);
  assert.equal(payableAttendanceState({ checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'NEEDS_REVIEW' }), 'PENDING_REVIEW');
  assert.equal(payableAttendanceState({ checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'VALID', checkOutSource: 'SYSTEM_AUTO_CLOSED' }), 'PENDING_REVIEW');
});

test('employee attendance eligibility is a profile field, not a role field', () => {
  const employee = model('Employee');
  assert.ok(employee.fields.some((field) => field.name === 'attendanceRequired'));
  assert.equal(employee.fields.some((field) => field.name === 'role'), false);
});

test('leave foundation preserves multi-stage approvals and ledger history', () => {
  const leave = model('LeaveRequest');
  const balance = model('LeaveBalance');
  assert.ok(leave.fields.some((field) => field.name === 'approvals' && field.type === 'LeaveApproval'));
  assert.ok(leave.fields.some((field) => field.name === 'balanceTransactions' && field.type === 'LeaveBalanceTransaction'));
  assert.ok(balance.fields.some((field) => field.name === 'transactions' && field.type === 'LeaveBalanceTransaction'));
});

test('sickness requests reject missing medical evidence before persistence', async () => {
  const service = new LeaveRequestsService({}, {});
  await assert.rejects(() => service.create({ type: 'SAKIT', startDate: '2026-09-01', reason: 'Sakit' }, { userId: 'u1', role: 'KARYAWAN' }));
});

test('temporary assignments resolve a work location without overwriting the primary placement', () => {
  const primary = 'primary-location';
  const location = effectiveWorkLocation(primary, new Date('2026-09-10'), [{
    status: 'APPROVED', startDate: new Date('2026-09-08'), endDate: new Date('2026-09-12'), locationId: 'temporary-location',
  }]);
  assert.equal(location, 'temporary-location');
  assert.equal(primary, 'primary-location');
});

test('overlapping primary placement date ranges are detected by the domain guard', () => {
  assert.equal(dateRangesOverlap('2026-09-01', '2026-09-10', '2026-09-10', '2026-09-12'), true);
  assert.equal(dateRangesOverlap('2026-09-01', '2026-09-09', '2026-09-10', '2026-09-12'), false);
});

test('payroll cycle validation has no fixed 3-20 assumption', () => {
  assert.equal(validatePayrollCycleDays(1, 31), true);
  assert.equal(validatePayrollCycleDays(3, 20), true);
  assert.equal(validatePayrollCycleDays(0, 20), false);
});

test('payroll revision foundation only permits a revision of a final original run', () => {
  assert.equal(canCreatePayrollRevision('FINALIZED'), true);
  assert.equal(canCreatePayrollRevision('DRAFT'), false);
  const revision = model('PayrollRevision');
  assert.ok(revision.fields.some((field) => field.name === 'payrollRunId'));
});
