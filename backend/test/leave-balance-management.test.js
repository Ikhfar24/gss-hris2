const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('class-validator');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { AdjustLeaveBalanceDto } = require('../dist/leave-requests/dto/adjust-leave-balance.dto');
const { InitializeLeaveBalanceDto } = require('../dist/leave-requests/dto/initialize-leave-balance.dto');
const { LeaveBalancesController } = require('../dist/leave-requests/leave-balances.controller');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');

const hrActor = { userId: 'hr-1', role: 'ADMIN_HR' };
const employeeActor = { userId: 'user-1', role: 'KARYAWAN' };
const systemAdminActor = { userId: 'admin-1', role: 'SYSTEM_ADMIN' };
const scopes = { assertEmployee: async () => {} };

function validWorkdayPrisma(overrides = {}) {
  return {
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
    employee: { findUnique: async () => ({ id: 'employee-1', status: 'ACTIVE', joinDate: new Date('2020-01-01') }) },
    leaveRequest: { findMany: async () => [] },
    placement: { findFirst: async () => ({ locationId: 'location-1', location: { workDays: [1, 2, 3, 4, 5] } }) },
    holiday: { findFirst: async () => null },
    ...overrides,
  };
}

function errorMessage(error) {
  return error.getResponse().message;
}

test('leave-balance DTOs enforce bounded integer years, entitlement, delta, and reason', async () => {
  const initialize = Object.assign(new InitializeLeaveBalanceDto(), { year: 1999, entitlementDays: -1, reason: 'no' });
  assert.equal((await validate(initialize)).length, 3);

  const adjust = Object.assign(new AdjustLeaveBalanceDto(), { year: 2101, delta: 0, reason: 'no' });
  assert.equal((await validate(adjust)).length, 3);

  assert.equal((await validate(Object.assign(new InitializeLeaveBalanceDto(), { year: 2026, entitlementDays: 12, reason: 'Annual entitlement' }))).length, 0);
  assert.equal((await validate(Object.assign(new AdjustLeaveBalanceDto(), { year: 2026, delta: -2, reason: 'Correction' }))).length, 0);
});

test('management routes expose ADMIN_HR metadata and service authorization rejects every other role', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveBalancesController.prototype.findEmployee), ['ADMIN_HR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveBalancesController.prototype.initialize), ['ADMIN_HR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, LeaveBalancesController.prototype.adjust), ['ADMIN_HR']);
  assert.equal(Reflect.getMetadata(ROLES_KEY, LeaveBalancesController.prototype.findMine), undefined);

  const service = new LeaveRequestsService({ $transaction: async () => assert.fail('unauthorized mutation entered a transaction') }, scopes);
  for (const role of ['KARYAWAN', 'KOORDINATOR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN']) {
    const actor = { userId: `user-${role}`, role };
    await assert.rejects(() => service.initializeLeaveBalance('employee-1', { year: 2026, entitlementDays: 12, reason: 'Annual' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => service.adjustLeaveBalance('employee-1', { year: 2026, delta: 1, reason: 'Correction' }, actor), /Hanya Admin HR/);
    await assert.rejects(() => service.findEmployeeLeaveBalances('employee-1', actor), /Hanya Admin HR/);
  }
});

test('balance reads resolve the linked employee, request newest-first ordering, and attach actor identity', async () => {
  const calls = {};
  const service = new LeaveRequestsService({
    user: {
      findUnique: async () => ({ employeeId: 'employee-1' }),
      findMany: async (args) => {
        calls.users = args;
        return [{ id: 'hr-1', name: 'HR Admin', email: 'hr@example.com', role: 'ADMIN_HR' }];
      },
    },
    employee: { findUnique: async () => ({ id: 'employee-1', name: 'Employee One', employeeNumber: 'E-1', email: 'one@example.com' }) },
    leaveBalance: { findMany: async (args) => {
      calls.balances = args;
      return [{ id: 'balance-1', year: 2026, transactions: [{ id: 'tx-1', createdById: 'hr-1' }] }];
    } },
  }, scopes);

  const result = await service.findMyLeaveBalances(employeeActor);
  assert.deepEqual(calls.balances.orderBy, { year: 'desc' });
  assert.deepEqual(calls.balances.include.transactions.orderBy, { createdAt: 'desc' });
  assert.deepEqual(calls.users.where.id.in, ['hr-1']);
  assert.deepEqual(result.balances[0].transactions[0].actor, { id: 'hr-1', name: 'HR Admin', email: 'hr@example.com', role: 'ADMIN_HR' });
});

test('initialization creates balance, entitlement ledger, and complete audit in one transaction', async () => {
  const writes = [];
  const prisma = {
    $transaction: async (callback) => callback({
      employee: { findUnique: async () => ({ id: 'employee-1' }) },
      leaveBalance: {
        findUnique: async () => null,
        create: async ({ data }) => { writes.push(['balance', data]); return { id: 'balance-1', ...data }; },
      },
      leaveBalanceTransaction: { create: async ({ data }) => { writes.push(['ledger', data]); return data; } },
      auditLog: { create: async ({ data }) => { writes.push(['audit', data]); return data; } },
    }),
  };
  const service = new LeaveRequestsService(prisma, scopes);
  service.readLeaveBalances = async () => ({ employee: {}, balances: [] });
  await service.initializeLeaveBalance('employee-1', { year: 2026, entitlementDays: 12, reason: 'Annual entitlement' }, hrActor);

  assert.deepEqual(writes.map(([type]) => type), ['balance', 'ledger', 'audit']);
  assert.deepEqual(writes[0][1], { employeeId: 'employee-1', year: 2026, entitlementDays: 12, usedDays: 0, remainingDays: 12 });
  assert.deepEqual(writes[1][1], { leaveBalanceId: 'balance-1', type: 'ENTITLEMENT', daysDelta: 12, balanceAfter: 12, reason: 'Annual entitlement', createdById: 'hr-1' });
  assert.equal(writes[2][1].source, 'leave-balances');
  assert.equal(writes[2][1].relatedEntityId, 'employee-1');
  assert.equal(writes[2][1].actorRole, 'ADMIN_HR');
  assert.deepEqual(writes[2][1].oldValue, { employeeId: 'employee-1', year: 2026, entitlementDays: null, usedDays: null, remainingDays: null });
  assert.deepEqual(writes[2][1].newValue, { employeeId: 'employee-1', year: 2026, entitlementDays: 12, usedDays: 0, remainingDays: 12, delta: 12 });
});

test('initialization fails for an unknown employee or an existing annual balance without writes', async () => {
  for (const scenario of [
    { employee: null, existing: null, message: 'Karyawan tidak ditemukan' },
    { employee: { id: 'employee-1' }, existing: { id: 'balance-1' }, message: 'Saldo cuti tahun 2026 sudah ada' },
  ]) {
    let writes = 0;
    const service = new LeaveRequestsService({
      $transaction: async (callback) => callback({
        employee: { findUnique: async () => scenario.employee },
        leaveBalance: { findUnique: async () => scenario.existing, create: async () => { writes += 1; } },
      }),
    }, scopes);
    await assert.rejects(
      () => service.initializeLeaveBalance('employee-1', { year: 2026, entitlementDays: 12, reason: 'Annual' }, hrActor),
      new RegExp(scenario.message),
    );
    assert.equal(writes, 0);
  }
});

test('initialization and adjustment reject blank reasons before opening a transaction', async () => {
  const service = new LeaveRequestsService({ $transaction: async () => assert.fail('blank reason entered a transaction') }, scopes);
  await assert.rejects(
    () => service.initializeLeaveBalance('employee-1', { year: 2026, entitlementDays: 12, reason: '   ' }, hrActor),
    /Alasan inisialisasi saldo wajib/,
  );
  await assert.rejects(
    () => service.adjustLeaveBalance('employee-1', { year: 2026, delta: 1, reason: '   ' }, hrActor),
    /Alasan penyesuaian saldo wajib/,
  );
});

test('adjustment preserves used days and records manual ledger plus old/new audit values atomically', async () => {
  const writes = [];
  const balance = { id: 'balance-1', employeeId: 'employee-1', year: 2026, entitlementDays: 12, usedDays: 4, remainingDays: 8 };
  const service = new LeaveRequestsService({
    $transaction: async (callback) => callback({
      leaveBalance: {
        findUnique: async () => balance,
        updateMany: async ({ where, data }) => { writes.push(['balance', { where, data }]); return { count: 1 }; },
      },
      leaveBalanceTransaction: { create: async ({ data }) => { writes.push(['ledger', data]); return data; } },
      auditLog: { create: async ({ data }) => { writes.push(['audit', data]); return data; } },
    }),
  }, scopes);
  service.readLeaveBalances = async () => ({ employee: {}, balances: [] });
  await service.adjustLeaveBalance('employee-1', { year: 2026, delta: -2, reason: 'Manual correction' }, hrActor);

  assert.deepEqual(writes[0][1], {
    where: { id: 'balance-1', entitlementDays: 12, usedDays: 4, remainingDays: 8 },
    data: { entitlementDays: { increment: -2 }, remainingDays: { increment: -2 } },
  });
  assert.equal(writes[1][1].type, 'MANUAL_ADJUSTMENT');
  assert.equal(writes[1][1].daysDelta, -2);
  assert.equal(writes[1][1].balanceAfter, 6);
  assert.deepEqual(writes[2][1].oldValue, { employeeId: 'employee-1', year: 2026, entitlementDays: 12, usedDays: 4, remainingDays: 8 });
  assert.deepEqual(writes[2][1].newValue, { employeeId: 'employee-1', year: 2026, entitlementDays: 10, usedDays: 4, remainingDays: 6, delta: -2 });
  assert.equal(writes[2][1].reason, 'Manual correction');
});

test('adjustment rejects missing balances and reductions below used or remaining days', async () => {
  for (const balance of [null, { id: 'balance-1', year: 2026, entitlementDays: 12, usedDays: 10, remainingDays: 2 }]) {
    let writes = 0;
    const service = new LeaveRequestsService({
      $transaction: async (callback) => callback({
        leaveBalance: { findUnique: async () => balance, updateMany: async () => { writes += 1; } },
      }),
    }, scopes);
    await assert.rejects(
      () => service.adjustLeaveBalance('employee-1', { year: 2026, delta: -3, reason: 'Correction' }, hrActor),
      balance ? /tidak boleh mengurangi/ : /tidak ditemukan/,
    );
    assert.equal(writes, 0);
  }
});

test('CUTI creation reports exact missing and insufficient messages while non-CUTI bypasses balance validation', async () => {
  const missingService = new LeaveRequestsService(validWorkdayPrisma({ leaveBalance: { findUnique: async () => null } }), scopes);
  await assert.rejects(
    () => missingService.create({ type: 'CUTI', startDate: '2026-09-07', reason: 'Annual leave' }, employeeActor),
    (error) => errorMessage(error) === 'Saldo cuti Anda belum diatur oleh Admin HR. Silakan hubungi HR.',
  );

  const insufficientService = new LeaveRequestsService(validWorkdayPrisma({ leaveBalance: { findUnique: async () => ({ remainingDays: 0 }) } }), scopes);
  await assert.rejects(
    () => insufficientService.create({ type: 'CUTI', startDate: '2026-09-07', reason: 'Annual leave' }, employeeActor),
    (error) => errorMessage(error) === 'Saldo cuti tidak mencukupi. Sisa saldo: 0 hari, pengajuan: 1 hari.',
  );

  for (const type of ['IZIN_MENDADAK', 'IZIN_LAIN', 'IZIN_PULANG_AWAL']) {
    let balanceRead = false;
    let created = false;
    const bypassPrisma = validWorkdayPrisma({
      leaveBalance: { findUnique: async () => { balanceRead = true; } },
      $transaction: async (callback) => callback({
        leaveRequest: { create: async ({ data }) => { created = true; return { id: 'leave-1', ...data, employee: {}, approvals: [] }; } },
        auditLog: { create: async () => ({}) },
      }),
    });
    await new LeaveRequestsService(bypassPrisma, scopes).create({
      type,
      startDate: '2026-09-07',
      reason: 'Personal matter',
    }, employeeActor);
    assert.equal(balanceRead, false, `${type} must not read leave balance`);
    assert.equal(created, true, `${type} must remain submittable without leave balance`);
  }

  let sicknessBalanceRead = false;
  const sicknessService = new LeaveRequestsService(validWorkdayPrisma({
    leaveBalance: { findUnique: async () => { sicknessBalanceRead = true; } },
  }), scopes);
  await assert.rejects(
    () => sicknessService.create({ type: 'SAKIT', startDate: '2026-09-07', reason: 'Medical leave' }, employeeActor),
    /Dokumen medis wajib/,
  );
  assert.equal(sicknessBalanceRead, false, 'SAKIT must not read leave balance');
});

test('frontend exposes one shared balance panel in Admin HR Employee 360 and employee self-service', () => {
  const root = path.join(__dirname, '..', '..', 'frontend');
  const panel = fs.readFileSync(path.join(root, 'components', 'leave', 'LeaveBalancePanel.tsx'), 'utf8');
  const management = fs.readFileSync(path.join(root, 'components', 'management', 'ManagementEmployeeProfile.tsx'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'components', 'employee', 'EmployeeFullProfile.tsx'), 'utf8');
  const leavePage = fs.readFileSync(path.join(root, 'app', '(dashboard)', 'leave-requests', 'page.tsx'), 'utf8');

  assert.match(panel, /\/leave-balances\/employees\/\$\{employeeId\}/);
  assert.match(panel, /\/leave-balances\/me/);
  assert.match(panel, /Hak tahunan/);
  assert.match(panel, /Terpakai/);
  assert.match(panel, /Sisa/);
  assert.match(panel, /Riwayat saldo/);
  assert.match(panel, /reason: form\.reason\.trim\(\)/);
  assert.match(management, /<LeaveBalancePanel employeeId=\{profile\.id\} canManage/);
  assert.match(profile, /<LeaveBalancePanel \/>/);
  assert.match(leavePage, /isEmployeeSelfService && <LeaveBalancePanel \/>/);
  assert.doesNotMatch(panel, /window\.(prompt|confirm)/);
});
