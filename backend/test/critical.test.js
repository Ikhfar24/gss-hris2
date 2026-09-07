const test = require('node:test');
const assert = require('node:assert/strict');

const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');
const { ReportsService } = require('../dist/reports/reports.service');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { EmployeesService } = require('../dist/employees/employees.service');
const { MediaService } = require('../dist/media/media.service');
const { AuthController } = require('../dist/auth/auth.controller');

const config = { get: (key) => (key === 'JWT_SECRET' ? 'a-32-character-minimum-jwt-secret!' : undefined) };

test('JWT validation rejects an inactive user even with a valid token claim', async () => {
  const strategy = new JwtStrategy(config, {
    user: { findUnique: async () => ({ id: 'u1', email: 'user@example.test', role: 'ADMIN_HR', isActive: false }) },
  });
  await assert.rejects(() => strategy.validate({ sub: 'u1', email: 'user@example.test', role: 'SYSTEM_ADMIN' }));
});

test('JWT validation uses the current database role instead of a stale token role', async () => {
  const strategy = new JwtStrategy(config, {
    user: { findUnique: async () => ({ id: 'u1', email: 'user@example.test', role: 'KARYAWAN', isActive: true }) },
  });
  const user = await strategy.validate({ sub: 'u1', email: 'user@example.test', role: 'SYSTEM_ADMIN' });
  assert.equal(user.role, 'KARYAWAN');
});

test('login sets an HttpOnly session cookie and does not return the JWT to JavaScript', async () => {
  const controller = new AuthController({ login: async () => ({ accessToken: 'secret-token', maxAgeMs: 1000, user: { id: 'u1', email: 'user@example.test', role: 'KARYAWAN' } }) });
  let cookie;
  const response = { cookie: (...args) => { cookie = args; } };
  const result = await controller.login({}, { user: { id: 'u1' } }, response);
  assert.equal(cookie[0], 'papaiz_access_token');
  assert.equal(cookie[2].httpOnly, true);
  assert.equal(result.accessToken, undefined);
});

test('leave detail denies an employee who does not own the request', async () => {
  const service = new LeaveRequestsService({
    leaveRequest: { findUnique: async () => ({ id: 'leave-1', employeeId: 'employee-2', employee: { coordinatorId: 'coord-2' } }) },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  }, {});
  await assert.rejects(() => service.findOne('leave-1', { userId: 'user-1', email: 'employee@example.test', role: 'KARYAWAN' }));
});

test('coordinator report queries always include the coordinator team scope', async () => {
  let receivedWhere;
  const service = new ReportsService({
    attendance: { findMany: async ({ where }) => { receivedWhere = where; return []; } },
  }, { queryWhere: async () => ({ employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } }) });
  service.render = async () => ({ buffer: Buffer.alloc(0), filename: 'test.xlsx', mime: 'application/octet-stream' });
  await service.exportAttendance({ format: 'xlsx' }, { userId: 'coord-1', email: 'coord@example.test', role: 'KOORDINATOR' });
  assert.deepEqual(receivedWhere.employee, { employmentType: { in: ['TENAGA_BORONGAN'] } });
});

test('coordinator cannot retrieve an employee outside their team by direct ID', async () => {
  const service = new EmployeesService({
    employee: { findUnique: async () => ({ id: 'employee-2', coordinatorId: 'coord-2', contracts: [], placements: [] }) },
  }, {});
  await assert.rejects(() => service.findOne('employee-2', { userId: 'coord-1', email: 'coord@example.test', role: 'KOORDINATOR' }));
});

test('protected leave media denies a user outside the owner team', async () => {
  const service = new MediaService({
    leaveRequest: { findFirst: async () => ({ employee: { coordinatorId: 'coord-2' } }) },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  });
  await assert.rejects(() => service.openLeaveDocument('employee-2', 'proof.pdf', { userId: 'user-1', email: 'user@example.test', role: 'KARYAWAN' }));
});

test('employee self-slip lookup follows User.employeeId relation, not a missing Employee.userId', async () => {
  let receivedWhere;
  const service = new PayrollService({
    employee: { findFirst: async ({ where }) => { receivedWhere = where; return { id: 'employee-1' }; } },
    payrollSlip: { findMany: async () => [] },
  }, {});
  await service.findMySlips({ userId: 'user-1', email: 'employee@example.test', role: 'KARYAWAN' });
  assert.deepEqual(receivedWhere, { user: { id: 'user-1' } });
});
