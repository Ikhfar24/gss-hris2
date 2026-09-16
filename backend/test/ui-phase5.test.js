const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { OvertimeRequestsController } = require('../dist/overtime-requests/overtime-requests.controller');
const { OvertimeRequestsService } = require('../dist/overtime-requests/overtime-requests.service');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');
const { PlacementRequestsService } = require('../dist/placement-requests/placement-requests.service');
const { AttendanceService } = require('../dist/attendance/attendance.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');

const root = path.resolve(__dirname, '../..');
const frontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');

test('Phase 5 Coordinator can cancel only their own pending overtime request', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, OvertimeRequestsController.prototype.cancel), ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'SYSTEM_ADMIN']);
  let update;
  const prisma = {
    overtimeRequest: {
      findUnique: async () => ({ id: 'overtime-1', employeeId: 'employee-1', requestedById: 'coordinator-1', status: 'PENDING', reason: 'Stock count', employee: { employmentType: 'TENAGA_BORONGAN' } }),
      update: async (query) => { update = query; return { id: 'overtime-1', status: 'CANCELLED' }; },
    },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  };
  const service = new OvertimeRequestsService(prisma, { record: async () => {} }, {});
  await service.cancel('overtime-1', { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(update.data.status, 'CANCELLED');

  prisma.user.findUnique = async () => ({ employeeId: 'employee-2' });
  await assert.rejects(() => service.cancel('overtime-1', { userId: 'coordinator-2', role: 'KOORDINATOR' }), /Hanya pemohon atau HR/);
});

test('Phase 5 Director leave detail is limited to the Director approval stage', async () => {
  const prisma = { leaveRequest: { findUnique: async () => ({ id: 'leave-1', employeeId: 'employee-1', status: 'APPROVED', documentUrl: null, employee: { employmentType: 'TENAGA_ARSIPARIS' }, approvals: [] }) } };
  const service = new LeaveRequestsService(prisma, {});
  await assert.rejects(() => service.findOne('leave-1', { userId: 'director-1', role: 'DIREKTUR' }), /tahap persetujuan Direktur/);
});

test('Phase 5 Director placement reads are limited to their pending queue', async () => {
  let query;
  const prisma = {
    placementRequest: {
      findMany: async (value) => { query = value; return []; },
      findUnique: async () => ({ id: 'placement-1', requestedById: 'hr-1', status: 'APPROVED' }),
    },
  };
  const service = new PlacementRequestsService(prisma, {}, {});
  await service.findAll({ userId: 'director-1', role: 'DIREKTUR' });
  assert.deepEqual(query.where, { status: 'PENDING_DIRECTOR' });
  await assert.rejects(() => service.findOne('placement-1', { userId: 'director-1', role: 'DIREKTUR' }), /tahap persetujuan Direktur/);
});

test('Phase 5 request screens align actions with ownership and avoid browser prompts', () => {
  const overtime = frontend('app/(dashboard)/overtime-requests/page.tsx');
  const temporary = frontend('app/(dashboard)/temporary-assignments/page.tsx');
  const placement = frontend('app/(dashboard)/placement-requests/page.tsx');
  const leave = frontend('app/(dashboard)/leave-requests/page.tsx');
  assert.match(overtime, /requestedById === session\.id/);
  assert.match(temporary, /row\.createdById === sessionId/);
  assert.match(placement, /row\.requestedById === sessionId/);
  assert.match(leave, /r\.employee\.id === session\.employee\?\.id/);
  assert.doesNotMatch([overtime, temporary, leave].join('\n'), /window\.(?:prompt|confirm)/);
});

test('Phase 5 session redirects preserve query strings and protect the request hub', () => {
  const middleware = frontend('middleware.ts');
  const provider = frontend('components/providers/SessionProvider.tsx');
  assert.match(middleware, /'\/requests'/);
  assert.match(middleware, /req\.nextUrl\.pathname.*req\.nextUrl\.search/s);
  assert.match(provider, /useSearchParams/);
  assert.match(provider, /encodeURIComponent\(returnTo\)/);
});

test('Phase 5 centralizes Jakarta date formatting for edited operational screens', () => {
  const format = frontend('lib/format.ts');
  const files = [
    frontend('app/(dashboard)/leave-requests/page.tsx'),
    frontend('app/(dashboard)/placement-requests/page.tsx'),
    frontend('app/(dashboard)/temporary-assignments/page.tsx'),
  ].join('\n');
  assert.match(format, /Asia\/Jakarta/);
  assert.match(format, /monthKeyFormatter\.formatToParts/);
  assert.doesNotMatch(format.slice(format.indexOf('export function monthKey')), /getFullYear|getMonth/);
  assert.doesNotMatch(files, /toLocaleDateString/);
});

test('Phase 5 attendance summary numerators exclude attendance-exempt Employees', async () => {
  let attendanceWhere;
  const attendance = new AttendanceService({
    employee: { count: async () => 0 },
    attendance: { findMany: async (query) => { attendanceWhere = query.where; return []; } },
  }, {}, { employeeWhere: async () => ({ employmentType: 'TENAGA_BORONGAN' }) });
  await attendance.summary('2026-09-09', { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(attendanceWhere.employee.employmentType, 'TENAGA_BORONGAN');
  assert.equal(attendanceWhere.employee.attendanceRequired, true);
  assert.equal(attendanceWhere.employee.leaveRequests.none.status, 'APPROVED');
  assert.deepEqual(attendanceWhere.employee.leaveRequests.none.type.in, ['CUTI', 'SAKIT', 'IZIN_MENDADAK', 'IZIN_LAIN']);

  const attendanceQueries = [];
  const dashboard = new DashboardService({
    employee: { count: async () => 0 },
    attendance: { count: async (query) => { attendanceQueries.push(query); return 0; } },
    leaveRequest: { count: async () => 0 },
    placementRequest: { count: async () => 0 },
    placement: { count: async () => 0 },
  }, { employeeWhere: async () => ({ employmentType: 'TENAGA_BORONGAN' }) });
  await dashboard.summary({ userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(attendanceQueries.length, 3);
  for (const query of attendanceQueries) {
    assert.equal(query.where.employee.employmentType, 'TENAGA_BORONGAN');
    assert.equal(query.where.employee.attendanceRequired, true);
    assert.equal(query.where.employee.leaveRequests.none.status, 'APPROVED');
  }
});

test('Phase 5 profile-change submission is Karyawan-only while review remains HR/System Admin-only', () => {
  const profileChanges = frontend('app/(dashboard)/profile-change-requests/page.tsx');
  assert.match(profileChanges, /session\.role === 'KARYAWAN'/);
  assert.match(profileChanges, /ADMIN_HR.*SYSTEM_ADMIN/s);
  assert.match(profileChanges, /ActionDialog/);
  assert.doesNotMatch(profileChanges, /getUser\(|window\.(?:prompt|confirm)/);
});
