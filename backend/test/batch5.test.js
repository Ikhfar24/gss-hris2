const test = require('node:test');
const assert = require('node:assert/strict');
const { Prisma } = require('@prisma/client');
const { LeaveRequestsController } = require('../dist/leave-requests/leave-requests.controller');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');
const { AbsenceCasesController } = require('../dist/absence-cases/absence-cases.controller');
const { AbsenceCasesService } = require('../dist/absence-cases/absence-cases.service');
const { OvertimeRequestsController } = require('../dist/overtime-requests/overtime-requests.controller');
const { OvertimeRequestsService } = require('../dist/overtime-requests/overtime-requests.service');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

const employeeActor = { userId: 'user-1', role: 'KARYAWAN' };
const coordinatorActor = { userId: 'coord-1', role: 'KOORDINATOR' };
const hrActor = { userId: 'hr-1', role: 'ADMIN_HR' };

function workdayPrisma(overrides = {}) {
  return {
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
    employee: { findUnique: async () => ({ id: 'employee-1', status: 'ACTIVE', joinDate: new Date('2020-01-01') }) },
    leaveRequest: { findMany: async () => [] },
    placement: { findFirst: async () => ({ locationId: 'location-1', location: { workDays: [1, 2, 3, 4, 5] } }) },
    holiday: { findFirst: async () => null },
    ...overrides,
  };
}

test('Batch 5 schema retains immutable leave approvals and leave balance transactions', () => {
  const approval = Prisma.dmmf.datamodel.models.find((model) => model.name === 'LeaveApproval');
  const transaction = Prisma.dmmf.datamodel.models.find((model) => model.name === 'LeaveBalanceTransaction');
  assert.ok(approval.fields.some((field) => field.name === 'stage'));
  assert.ok(approval.uniqueFields.some((fields) => fields.includes('leaveRequestId') && fields.includes('stage')));
  assert.ok(transaction.fields.some((field) => field.name === 'leaveRequestId'));
});

test('leave workflow routes coordinator approvals by leave type and employment type', () => {
  const service = new LeaveRequestsService({});
  assert.equal(service.nextStatus('CUTI', 'TENAGA_BORONGAN', 'COORDINATOR'), 'PENDING_HR');
  assert.equal(service.nextStatus('IZIN_LAIN', 'TENAGA_ARSIPARIS', 'COORDINATOR'), 'APPROVED');
  assert.equal(service.nextStatus('RESIGN', 'TENAGA_ARSIPARIS', 'HR'), 'PENDING_DIRECTOR');
  assert.equal(service.nextStatus('RESIGN', 'TENAGA_BORONGAN', 'HR'), 'APPROVED');
});

test('HR intervention requires an explicit reason', async () => {
  const service = new LeaveRequestsService({});
  await assert.rejects(
    () => service.intervene('leave-1', { approve: true, note: ' ' }, { userId: 'hr-1', role: 'ADMIN_HR' }),
    /Alasan intervensi wajib/,
  );
});

test('employee leave requests are self-scoped and early-leave permission does not touch payroll', async () => {
  let created;
  const prisma = workdayPrisma({
    employee: { findUnique: async ({ where }) => {
      assert.equal(where.id, 'employee-1');
      return { id: 'employee-1', status: 'ACTIVE', joinDate: new Date('2020-01-01') };
    } },
  });
  prisma.$transaction = async (callback) => callback({
    leaveRequest: { create: async ({ data }) => {
      created = data;
      return { id: 'leave-1', ...data, employee: {}, approvals: [] };
    } },
    auditLog: { create: async () => ({}) },
  });

  await new LeaveRequestsService(prisma).create({
    employeeId: 'another-employee', type: 'IZIN_PULANG_AWAL', startDate: '2026-09-07', reason: 'Urusan keluarga',
  }, employeeActor);

  assert.equal(created.employeeId, 'employee-1');
  assert.equal('payroll' in prisma, false);
});

test('leave review rejects an actor outside the current approval stage before a transaction', async () => {
  let transactionCalled = false;
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => ({
      id: 'leave-1', status: 'PENDING_COORDINATOR', type: 'SAKIT', employeeId: 'employee-1',
      employee: { coordinatorId: 'coord-2', employmentType: 'TENAGA_BORONGAN' }, approvals: [],
    }) },
    $transaction: async () => { transactionCalled = true; },
  });
  await assert.rejects(() => service.review('leave-1', { approve: true }, coordinatorActor), /tidak berwenang/);
  assert.equal(transactionCalled, false);
});

test('leave approval follows coordinator then HR stages with immutable history', async () => {
  const approvals = [];
  const request = {
    id: 'leave-1', status: 'PENDING_COORDINATOR', type: 'SAKIT', employeeId: 'employee-1', startDate: new Date('2026-09-07'),
    employee: { coordinatorId: 'coord-1', employmentType: 'TENAGA_BORONGAN' }, approvals, documentUrl: null,
  };
  const prisma = {
    leaveRequest: {
      findUnique: async () => request,
    },
    $transaction: async (callback) => callback({
      leaveApproval: { create: async ({ data }) => approvals.push(data) },
      leaveRequest: { update: async ({ data }) => Object.assign(request, data) },
      auditLog: { create: async () => ({}) },
    }),
  };
  const service = new LeaveRequestsService(prisma);
  await service.review('leave-1', { approve: true, note: 'Team approved' }, coordinatorActor);
  assert.equal(request.status, 'PENDING_HR');
  await service.review('leave-1', { approve: true, note: 'HR approved' }, hrActor);
  assert.equal(request.status, 'APPROVED');
  assert.deepEqual(approvals.map((approval) => approval.stage), ['COORDINATOR', 'HR']);
});

test('leave creation refuses overlapping active periods before persistence', async () => {
  let transactionCalled = false;
  const service = new LeaveRequestsService(workdayPrisma({
    leaveRequest: { findMany: async () => [{ startDate: new Date('2026-09-07'), endDate: null }] },
    $transaction: async () => { transactionCalled = true; },
  }));
  await assert.rejects(() => service.create({ type: 'IZIN_LAIN', startDate: '2026-09-07', reason: 'Bentrok' }, employeeActor), /bertabrakan/);
  assert.equal(transactionCalled, false);
});

test('cuti creation refuses insufficient balance before persistence', async () => {
  let transactionCalled = false;
  const service = new LeaveRequestsService(workdayPrisma({
    leaveBalance: { findUnique: async () => ({ id: 'balance-1', remainingDays: 0 }) },
    $transaction: async () => { transactionCalled = true; },
  }));
  await assert.rejects(() => service.create({ type: 'CUTI', startDate: '2026-09-07', reason: 'Cuti' }, employeeActor), /Saldo cuti/);
  assert.equal(transactionCalled, false);
});

test('final cuti approval does not debit a leave balance twice', async () => {
  let balanceUpdated = false;
  let ledgerCreated = false;
  const request = {
    id: 'leave-1', status: 'PENDING_HR', type: 'CUTI', employeeId: 'employee-1', startDate: new Date('2026-09-07'),
    employee: { coordinatorId: 'coord-1', employmentType: 'TENAGA_BORONGAN' }, approvals: [], documentUrl: null,
  };
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (callback) => callback({
      leaveApproval: { create: async () => ({}) },
      leaveRequest: { update: async ({ data }) => ({ ...request, ...data }) },
      leaveBalanceTransaction: { findFirst: async () => ({ id: 'existing-ledger-entry' }), create: async () => { ledgerCreated = true; } },
      leaveBalance: { updateMany: async () => { balanceUpdated = true; } },
      auditLog: { create: async () => ({}) },
    }),
  });
  await service.review('leave-1', { approve: true }, hrActor);
  assert.equal(balanceUpdated, false);
  assert.equal(ledgerCreated, false);
});

test('sickness evidence and leave document access are protected before writes', async () => {
  let employeeLookedUp = false;
  const service = new LeaveRequestsService({
    employee: { findUnique: async () => { employeeLookedUp = true; } },
    leaveRequest: { findUnique: async () => ({ id: 'leave-1', employeeId: 'employee-2', employee: { coordinatorId: 'coord-2' } }) },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  });
  await assert.rejects(() => service.create({ type: 'SAKIT', startDate: '2026-09-07', reason: 'Sakit' }, employeeActor), /Dokumen medis wajib/);
  await assert.rejects(() => service.findOne('leave-1', employeeActor), /tidak berhak/);
  assert.equal(employeeLookedUp, false);
});

test('resignation waits for its effective date, then deactivates access and records history', async () => {
  const actions = [];
  const futureService = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => ({ id: 'resign-future', type: 'RESIGN', status: 'APPROVED', startDate: new Date('2099-01-01'), employeeId: 'employee-1', employee: { coordinatorId: 'coord-1' } }) },
    $transaction: async () => assert.fail('future resignation must not be finalized'),
  });
  await assert.rejects(() => futureService.finalizeResignation('resign-future', hrActor), /belum tiba/);

  const request = { id: 'resign-now', type: 'RESIGN', status: 'PENDING_HR', startDate: new Date('2020-01-01'), employeeId: 'employee-1', employee: { coordinatorId: 'coord-1', employmentType: 'TENAGA_BORONGAN' }, approvals: [], documentUrl: null };
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => request },
    $transaction: async (callback) => callback({
      leaveApproval: { create: async () => ({}) },
      leaveRequest: { update: async ({ data }) => ({ ...request, ...data }) },
      user: { findMany: async () => [{ id: 'user-1', isActive: true }], updateMany: async () => ({ count: 1 }) },
      employee: { update: async () => ({}) },
      placement: { findMany: async () => [{ id: 'placement-1', endDate: null }], updateMany: async () => ({ count: 1 }) },
      auditLog: { create: async ({ data }) => actions.push(data) },
    }),
  });
  await service.review('resign-now', { approve: true }, hrActor);
  assert.deepEqual(actions.map((entry) => entry.action), ['EMPLOYEE_RESIGNED', 'USER_DEACTIVATED_FOR_RESIGN', 'PLACEMENT_ENDED_FOR_RESIGN', 'LEAVE_REQUEST_REVIEW']);
});

test('approved leave suppresses alpha-case creation before absence persistence', async () => {
  let absenceCreated = false;
  const service = new AbsenceCasesService({
    employee: { findUnique: async () => ({ id: 'employee-1' }) },
    leaveRequest: { findFirst: async () => ({ id: 'leave-1' }) },
    absenceCase: { create: async () => { absenceCreated = true; } },
  }, {});
  await assert.rejects(() => service.create({ employeeId: 'employee-1', date: '2026-09-07' }, hrActor), /tercakup pengajuan/);
  assert.equal(absenceCreated, false);
});

test('overtime rejects unauthorized review and approval stores no monetary fields', async () => {
  const request = { id: 'overtime-1', employeeId: 'employee-1', requestedById: 'user-1', status: 'PENDING', reason: 'Stock count', employee: { coordinatorId: 'coord-1' } };
  let updateData;
  const service = new OvertimeRequestsService({
    overtimeRequest: {
      findUnique: async () => request,
      update: async ({ data }) => { updateData = data; return { ...request, ...data }; },
    },
    employee: { findUnique: async () => ({ status: 'ACTIVE' }) },
  }, { record: async () => {} });
  await assert.rejects(() => service.review('overtime-1', { approve: true }, employeeActor), /tidak berwenang/);
  await service.review('overtime-1', { approve: true, note: 'Approved' }, coordinatorActor);
  assert.deepEqual(Object.keys(updateData).sort(), ['reviewNote', 'reviewedAt', 'reviewedById', 'status']);
});

test('leave controller exposes staged reviews and HR-only intervention/finalization', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveRequestsController.prototype.review), ['KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN', 'DIREKTUR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveRequestsController.prototype.intervene), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveRequestsController.prototype.finalizeResignation), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AbsenceCasesController.prototype.create), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AbsenceCasesController.prototype.resolve), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OvertimeRequestsController.prototype.create), ['KARYAWAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OvertimeRequestsController.prototype.review), ['KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN']);
});
