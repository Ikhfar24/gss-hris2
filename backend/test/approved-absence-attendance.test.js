const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AttendanceService } = require('../dist/attendance/attendance.service');
const {
  ATTENDANCE_BLOCKING_LEAVE_TYPES,
  approvedFullDayAbsenceWhere,
} = require('../dist/common/domain/approved-full-day-absence');

const actor = { userId: 'user-1', role: 'KARYAWAN' };

function fixture(leaveRequest) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const location = {
    id: 'location-1', name: 'Kantor', latitude: -7.4, longitude: 109.2,
    radiusMeters: 100, workDays: [day.getDay()], checkInTime: '08:00', checkOutTime: '17:00', toleranceMin: 10,
  };
  const employee = {
    id: 'employee-1', status: 'ACTIVE', attendanceRequired: true, attendanceMode: 'GEOFENCE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  let attendanceRead = false;
  const prisma = {
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    placement: { findMany: async () => [] },
    leaveRequest: { findFirst: async ({ where }) => {
      assert.equal(where.employeeId, employee.id);
      assert.equal(where.status, 'APPROVED');
      assert.deepEqual(where.type.in, ['CUTI', 'SAKIT', 'IZIN_MENDADAK', 'IZIN_LAIN']);
      return leaveRequest;
    } },
    attendance: { findUnique: async () => { attendanceRead = true; return null; } },
    holiday: { findFirst: async () => null },
  };
  return { service: new AttendanceService(prisma, {}, {}), attendanceRead: () => attendanceRead };
}

test('approved full-day absence predicate blocks only the approved full-day types', () => {
  assert.deepEqual(ATTENDANCE_BLOCKING_LEAVE_TYPES, ['CUTI', 'SAKIT', 'IZIN_MENDADAK', 'IZIN_LAIN']);
  assert.equal(ATTENDANCE_BLOCKING_LEAVE_TYPES.includes('IZIN_PULANG_AWAL'), false);
  const where = approvedFullDayAbsenceWhere(new Date('2026-09-16'));
  assert.equal(where.status, 'APPROVED');
  assert.deepEqual(where.OR, [
    { endDate: { gte: new Date('2026-09-16') } },
    { endDate: null, startDate: new Date('2026-09-16') },
  ]);
});

for (const type of ATTENDANCE_BLOCKING_LEAVE_TYPES) {
  test(`approved ${type} rejects direct API check-in before attendance persistence`, async () => {
    const { service, attendanceRead } = fixture({ id: `leave-${type}`, type, status: 'APPROVED' });
    await assert.rejects(
      () => service.checkIn({}, actor),
      /Presensi tidak tersedia pada tanggal cuti, sakit, atau izin tidak masuk yang telah disetujui/,
    );
    assert.equal(attendanceRead(), false);
  });
}

test('approved full-day absence also rejects direct API check-out', async () => {
  const { service, attendanceRead } = fixture({ id: 'leave-cuti', type: 'CUTI', status: 'APPROVED' });
  await assert.rejects(
    () => service.checkOut({}, actor),
    /Presensi tidak tersedia pada tanggal cuti, sakit, atau izin tidak masuk yang telah disetujui/,
  );
  assert.equal(attendanceRead(), false);
});

test('early-leave, pending, rejected, and cancelled requests cannot match the blocking query', () => {
  const where = approvedFullDayAbsenceWhere(new Date('2026-09-16'));
  assert.equal(where.type.in.includes('IZIN_PULANG_AWAL'), false);
  for (const status of ['PENDING', 'PENDING_COORDINATOR', 'PENDING_HR', 'REJECTED', 'CANCELLED']) {
    assert.notEqual(where.status, status);
  }
});

test('today response exposes approved absence for action-free frontend presentation', async () => {
  const absence = { id: 'leave-sick', type: 'SAKIT', status: 'APPROVED', startDate: new Date(), endDate: null };
  const { service } = fixture(absence);
  const today = await service.myToday(actor);
  assert.equal(today.approvedAbsence, absence);
});

test('frontend attendance and dashboards replace attendance actions with approved absence state', () => {
  const root = path.resolve(__dirname, '../..');
  const read = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');
  const attendance = read('app/(dashboard)/attendance/page.tsx');
  assert.match(attendance, /today\.approvedAbsence/);
  assert.match(attendance, /Check-in dan check-out tidak tersedia/);
  for (const file of ['components/employee/EmployeeHome.tsx', 'components/management/ManagementHome.tsx', 'components/phase4/RoleHomes.tsx']) {
    const source = read(file);
    assert.match(source, /approvedAbsence/);
    assert.match(source, /approvedAbsenceLabel/);
  }
});

test('mobile employee cards keep padded status and actions away from card edges', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../frontend/app/(dashboard)/employees/page.tsx'), 'utf8');
  assert.match(source, /rounded-xl bg-paper p-4 shadow-card/);
  assert.match(source, /StatusBadge status=\{employee\.status\} className="self-center"/);
  assert.match(source, /mt-5 grid gap-2 border-t border-border pt-4/);
});
