const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');

const { isPayableAttendance } = require('../dist/common/domain/attendance-payable');
const { payableAttendanceState } = require('../dist/common/domain/attendance-payable');
const { effectiveWorkLocation } = require('../dist/common/domain/temporary-assignment');
const { AttendanceController } = require('../dist/attendance/attendance.controller');
const { AttendanceService } = require('../dist/attendance/attendance.service');
const { PlacementRequestsService } = require('../dist/placement-requests/placement-requests.service');
const { PlacementRequestsController } = require('../dist/placement-requests/placement-requests.controller');
const { TemporaryAssignmentsService } = require('../dist/temporary-assignments/temporary-assignments.service');
const { TemporaryAssignmentsController } = require('../dist/temporary-assignments/temporary-assignments.controller');
const { MediaService } = require('../dist/media/media.service');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { AbsenceCasesService } = require('../dist/absence-cases/absence-cases.service');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

const coordinatorDenied = { assertEmployee: async () => { throw new Error('Anda tidak berwenang'); } };
const coordinatorApproved = { assertEmployee: async () => {} };

test('Batch 4 schema keeps immutable attendance review records and forgotten checkout marker', () => {
  const attendance = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'Attendance');
  const review = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'AttendanceReview');
  assert.ok(attendance.fields.some((field) => field.name === 'forgottenCheckout'));
  assert.ok(attendance.fields.some((field) => field.name === 'reviews'));
  assert.ok(review.fields.some((field) => field.name === 'decision'));
  assert.ok(review.fields.some((field) => field.name === 'reviewedById'));
});

test('system auto-closed attendance is never payable, including after review approval', () => {
  assert.equal(isPayableAttendance({
    checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'APPROVED_AFTER_REVIEW', checkOutSource: 'SYSTEM_AUTO_CLOSED',
  }), false);
});

test('effective temporary assignment is resolved at the event date', () => {
  assert.equal(effectiveWorkLocation('primary', new Date('2026-09-10T09:00:00'), [{
    status: 'APPROVED', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-10'), locationId: 'temporary',
  }]), 'temporary');
});

test('only coordinators, HR, and system admins can access attendance reviews', () => {
  const roles = Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.review);
  assert.equal(roles.includes('KARYAWAN'), false);
  assert.equal(roles.includes('KOORDINATOR'), true);
  assert.equal(roles.includes('ADMIN_HR'), true);
  assert.equal(roles.includes('SYSTEM_ADMIN'), true);
});

test('effective temporary assignment ignores pending, expired, and future assignments', () => {
  const date = new Date('2026-09-10T12:00:00');
  assert.equal(effectiveWorkLocation('primary', date, [
    { status: 'PENDING', startDate: new Date('2026-09-10'), endDate: new Date('2026-09-10'), locationId: 'pending' },
    { status: 'APPROVED', startDate: new Date('2026-09-01'), endDate: new Date('2026-09-09'), locationId: 'expired' },
    { status: 'APPROVED', startDate: new Date('2026-09-11'), endDate: new Date('2026-09-12'), locationId: 'future' },
  ]), 'primary');
});

test('historical attendance resolution does not activate scheduled placements prematurely', async () => {
  let placementLookups = 0;
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
    placement: { findMany: async () => { placementLookups += 1; return []; } },
    employee: { findUnique: async () => ({
      id: 'employee-1', attendanceRequired: true,
      placements: [{ status: 'ACTIVE', startDate: new Date('2026-08-01'), endDate: null, locationId: 'primary', location: { id: 'primary' } }],
      temporaryAssignments: [],
    }) },
  }, {}, coordinatorApproved);
  const resolved = await service.getEmployeeForUser('user-1', new Date('2026-08-15T09:00:00'));
  assert.equal(resolved.location.id, 'primary');
  assert.equal(placementLookups, 0);
});

test('future approved placement stays scheduled and leaves the active placement open', async () => {
  const calls = [];
  const future = new Date(Date.now() + 3 * 86400000);
  const prisma = {
    $transaction: async (work) => work({
      placement: {
        findMany: async ({ where }) => where.status === 'SCHEDULED'
          ? []
          : [{ id: 'active', startDate: new Date('2026-01-01'), endDate: null, status: 'ACTIVE' }],
        updateMany: async (args) => calls.push(['updateMany', args]),
        create: async (args) => calls.push(['create', args]),
      },
    }),
  };
  await new PlacementRequestsService(prisma, {}).finalizePlacement({ id: 'request-1', employeeId: 'employee-1', destinationLocationId: 'next-location', startDate: future, endDate: null });
  assert.equal(calls.some(([name]) => name === 'updateMany'), false);
  assert.deepEqual(calls, [['create', { data: { employeeId: 'employee-1', locationId: 'next-location', startDate: future, endDate: null, status: 'SCHEDULED', sourceRequestId: 'request-1' } }]]);
});

test('placement request roles separate coordinator submission, HR review, and director mutation approval', () => {
  const create = Reflect.getMetadata(ROLES_KEY, PlacementRequestsController.prototype.create);
  const hrReview = Reflect.getMetadata(ROLES_KEY, PlacementRequestsController.prototype.hrReview);
  const directorApprove = Reflect.getMetadata(ROLES_KEY, PlacementRequestsController.prototype.directorApprove);
  assert.deepEqual(create, ['KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(hrReview, ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(directorApprove, ['DIREKTUR', 'SYSTEM_ADMIN']);
});

test('temporary assignment rejects overlapping periods and an origin location as destination', async () => {
  const service = new TemporaryAssignmentsService({
    placement: { findUnique: async () => ({ employeeId: 'employee-1', locationId: 'origin', status: 'ACTIVE', startDate: new Date('2026-09-01'), endDate: null }) },
    location: { findUnique: async () => ({ id: 'destination', isActive: true, clientId: 'client-1' }) },
    temporaryAssignment: { findMany: async () => [{ startDate: new Date('2026-09-10'), endDate: new Date('2026-09-12') }] },
  }, {});
  await assert.rejects(() => service.assertValidDetails('employee-1', 'origin-placement', 'destination', 'client-1', new Date('2026-09-12'), new Date('2026-09-14')));
  const sameLocation = new TemporaryAssignmentsService({
    placement: { findUnique: async () => ({ employeeId: 'employee-1', locationId: 'origin', status: 'ACTIVE', startDate: new Date('2026-09-01'), endDate: null }) },
    location: { findUnique: async () => ({ id: 'origin', isActive: true, clientId: null }) },
    temporaryAssignment: { findMany: async () => [] },
  }, {});
  await assert.rejects(() => sameLocation.assertValidDetails('employee-1', 'origin-placement', 'origin', null, new Date('2026-09-12'), new Date('2026-09-14')));
});

test('temporary assignment completion cannot occur before its end date', async () => {
  const service = new TemporaryAssignmentsService({}, {});
  service.findOne = async () => ({ id: 'assignment-1', status: 'APPROVED', endDate: new Date(Date.now() + 86400000) });
  await assert.rejects(() => service.complete('assignment-1', { reason: 'Selesai' }, { userId: 'hr-1', role: 'ADMIN_HR' }));
});

test('temporary assignment approval and completion are restricted to HR or system admin', () => {
  const review = Reflect.getMetadata(ROLES_KEY, TemporaryAssignmentsController.prototype.review);
  const complete = Reflect.getMetadata(ROLES_KEY, TemporaryAssignmentsController.prototype.complete);
  assert.deepEqual(review, ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(complete, ['ADMIN_HR', 'SYSTEM_ADMIN']);
});

test('attendance evidence requires a documented fallback and rejects out-of-radius coordinates', () => {
  const service = new AttendanceService({}, {}, coordinatorApproved);
  const location = { latitude: -6.2, longitude: 106.8, radiusMeters: 50 };
  assert.throws(() => service.evaluateEvidence(location, {}, 'employee-1'));
  assert.throws(() => service.evaluateEvidence(location, {
    latitude: -6.21, longitude: 106.81, selfieBase64: 'data:image/png;base64,AA==',
  }, 'employee-1'), /Di luar radius/);
});

test('holiday attendance is not late and no absence case is created for a holiday', async () => {
  const attendance = new AttendanceService({ holiday: { findFirst: async () => ({ id: 'holiday-1' }) } }, {}, coordinatorApproved);
  assert.equal(await attendance.computeLatenessStatus({ id: 'location-1', workDays: [1], checkInTime: '08:00', toleranceMin: 10 }, new Date('2026-09-07T10:00:00'), new Date('2026-09-07')), 'NOT_APPLICABLE');
  const absence = new AbsenceCasesService({
    employee: { findUnique: async () => ({ id: 'employee-1' }) },
    placement: { findFirst: async () => ({ location: { id: 'location-1', workDays: [1] } }) },
    leaveRequest: { findFirst: async () => null },
    holiday: { findFirst: async () => ({ id: 'holiday-1' }) },
    absenceCase: { create: async () => { throw new Error('must not create'); } },
  }, {});
  await assert.rejects(() => absence.create({ employeeId: 'employee-1', date: '2026-09-07' }, { userId: 'hr-1', role: 'ADMIN_HR' }), /hari libur/);
});

test('attendance review denies self review and coordinators outside the employee team', async () => {
  const record = { id: 'attendance-1', employee: { id: 'employee-1', coordinatorId: 'coordinator-1' }, location: {}, validationStatus: 'NEEDS_REVIEW', payableStatus: 'PENDING_REVIEW', checkInAt: new Date(), checkOutAt: new Date(), checkOutSource: 'EMPLOYEE' };
  const service = new AttendanceService({
    attendance: { findUnique: async () => record },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  }, {}, coordinatorDenied);
  await assert.rejects(() => service.review('attendance-1', { decision: 'APPROVED', note: 'ok' }, { userId: 'reviewer-1', role: 'ADMIN_HR' }), /sendiri/);
  service.prisma.user.findUnique = async () => ({ employeeId: 'reviewer-employee' });
  await assert.rejects(() => service.review('attendance-1', { decision: 'APPROVED', note: 'ok' }, { userId: 'coordinator-2', role: 'KOORDINATOR' }), /tidak berwenang/);
});

test('attendance review writes an immutable decision and approves a completed employee checkout for pay', async () => {
  const writes = [];
  const record = { id: 'attendance-1', employee: { id: 'employee-1', coordinatorId: 'coordinator-1' }, location: {}, validationStatus: 'NEEDS_REVIEW', payableStatus: 'PENDING_REVIEW', checkInAt: new Date('2026-09-07T08:00:00'), checkOutAt: new Date('2026-09-07T16:00:00'), checkOutSource: 'EMPLOYEE' };
  const prisma = {
    attendance: { findUnique: async () => record, update: (args) => ({ kind: 'update', args }) },
    attendanceReview: { create: (args) => ({ kind: 'review', args }) },
    user: { findUnique: async () => ({ employeeId: 'reviewer-employee' }) },
    $transaction: async (operations) => {
      writes.push(...operations);
      return [{ id: 'review-1' }, { ...record, validationStatus: 'APPROVED_AFTER_REVIEW', payableStatus: 'PAYABLE' }];
    },
  };
  const result = await new AttendanceService(prisma, { record: async () => {} }, coordinatorApproved).review('attendance-1', { decision: 'APPROVED', note: 'Evidence verified' }, { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(writes[0].args.data.decision, 'APPROVED');
  assert.equal(writes[0].args.data.reviewedById, 'coordinator-1');
  assert.equal(writes[1].args.data.payableStatus, 'PAYABLE');
  assert.equal(result.validationStatus, 'APPROVED_AFTER_REVIEW');
});

test('protected media paths are inferred from stored evidence and deny unrelated employees', async () => {
  const service = new MediaService({ user: { findUnique: async () => ({ employeeId: 'employee-2' }) } }, coordinatorApproved);
  assert.deepEqual(service.mediaPaths('selfies', 'employee-1', 'check-in.jpg'), [
    '/uploads/selfies/employee-1/check-in.jpg',
    '/api/v1/media/selfies/employee-1/check-in.jpg',
  ]);
  await assert.rejects(() => service.assertAccess('employee-1', 'coordinator-1', { userId: 'user-2', role: 'KARYAWAN' }));
  await service.assertAccess('employee-1', 'coordinator-1', { userId: 'coordinator-1', role: 'KOORDINATOR' });
});

test('forgotten checkout is distinct from a normal checkout and remains pending even after approval', async () => {
  const updated = [];
  const service = new AttendanceService({
    attendance: {
      findUnique: async () => ({ id: 'attendance-1', date: new Date('2026-09-07'), checkInAt: new Date('2026-09-07T08:00:00'), checkOutAt: null, validationStatus: 'VALID', location: { checkOutTime: '16:00' } }),
      update: async ({ data }) => { updated.push(data); return { id: 'attendance-1', ...data }; },
    },
  }, { record: async () => {} }, coordinatorApproved);
  await service.autoCloseForgottenCheckout('attendance-1', 'Lupa checkout', { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(updated[0].forgottenCheckout, true);
  assert.equal(updated[0].checkOutSource, 'SYSTEM_AUTO_CLOSED');
  assert.equal(payableAttendanceState({ checkInAt: new Date(), checkOutAt: new Date(), validationStatus: 'APPROVED_AFTER_REVIEW', checkOutSource: 'SYSTEM_AUTO_CLOSED' }), 'PENDING_REVIEW');
});

test('payable matrix requires both events, a valid review state, and a non-system checkout', () => {
  const checkInAt = new Date('2026-09-07T08:00:00');
  const checkOutAt = new Date('2026-09-07T16:00:00');
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'VALID', checkOutSource: 'EMPLOYEE' }), true);
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'APPROVED_AFTER_REVIEW', checkOutSource: 'HR_CORRECTION' }), true);
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt: null, validationStatus: 'VALID', checkOutSource: 'EMPLOYEE' }), false);
  assert.equal(isPayableAttendance({ checkInAt, checkOutAt, validationStatus: 'NEEDS_REVIEW', checkOutSource: 'EMPLOYEE' }), false);
  assert.equal(payableAttendanceState({ checkInAt, checkOutAt, validationStatus: 'REJECTED', checkOutSource: 'EMPLOYEE' }), 'NOT_PAYABLE');
});

test('alpha cases require 24 hours before HR confirmation and payroll daily-rate counts attendance without creating database records', async () => {
  const absence = new AbsenceCasesService({
    absenceCase: { findUnique: async () => ({ id: 'absence-1', employeeId: 'employee-1', employee: { coordinatorId: 'coordinator-1' }, status: 'PENDING_EXPLANATION', createdAt: new Date() }) },
  }, {});
  await assert.rejects(() => absence.resolve('absence-1', { decision: 'CONFIRM_ALPHA', reason: 'No explanation' }, { userId: 'hr-1', role: 'ADMIN_HR' }), /24 jam/);
  const slips = [];
  const payroll = new PayrollService({
    employee: { findMany: async () => [{ id: 'daily-1', name: 'Daily', employmentType: 'TENAGA_BORONGAN', dailyRate: 100000, contracts: [] }, { id: 'missing-1', name: 'Missing', employmentType: 'TENAGA_BORONGAN', dailyRate: null, contracts: [] }] },
    payrollRun: { create: async () => ({ id: 'run-1' }) },
    attendance: { count: async () => 3 },
    payrollSlip: { create: async ({ data }) => { slips.push(data); } },
    $transaction: async (callback) => callback({
      payrollRun: { create: async () => ({ id: 'run-1' }) },
      employee: { findMany: async () => [{ id: 'daily-1', name: 'Daily', employmentType: 'TENAGA_BORONGAN', dailyRate: 100000, contracts: [] }, { id: 'missing-1', name: 'Missing', employmentType: 'TENAGA_BORONGAN', dailyRate: null, contracts: [] }] },
      attendance: { count: async () => 3 },
      payrollSlip: { create: async ({ data }) => { slips.push(data); } },
    }),
  }, { record: async () => {} });
  payroll.findOne = async () => ({ id: 'run-1' });
  const result = await payroll.createRun({ periodStart: '2026-09-01', periodEnd: '2026-09-30' }, { userId: 'finance-1', role: 'KEUANGAN' });
  assert.deepEqual(slips[0], { payrollRunId: 'run-1', employeeId: 'daily-1', basis: 'DAILY_RATE', baseSalary: 300000, dailyRate: 100000, presentDays: 3, netPay: 300000 });
  assert.deepEqual(result.skipped, ['Missing']);
});
