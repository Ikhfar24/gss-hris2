const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { AttendanceController } = require('../dist/attendance/attendance.controller');
const { AttendanceService } = require('../dist/attendance/attendance.service');
const { LocationsService } = require('../dist/locations/locations.service');
const { EmployeesService } = require('../dist/employees/employees.service');

const root = path.resolve(__dirname, '../..');
const frontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');

function evidence() {
  return { latitude: -7.4253, longitude: 109.2397, accuracyMeters: 5, failureReason: 'CAMERA_FAILED', failureNote: 'Camera unavailable during test' };
}

test('consolidated UAT keeps GEOFENCE distance authoritative and MOBILE radius-free', () => {
  const service = new AttendanceService({}, {}, {});
  assert.throws(() => service.evaluateEvidence({ name: 'Missing point', latitude: null, longitude: null, radiusMeters: 100 }, evidence(), 'employee-1', 'GEOFENCE'), /koordinat geofence belum lengkap/);
  const geofence = service.evaluateEvidence({ name: 'Purwokerto', latitude: -7.4253, longitude: 109.2397, radiusMeters: 100 }, evidence(), 'employee-1', 'GEOFENCE');
  assert.equal(geofence.gpsStatus, 'OK');
  assert.equal(geofence.distance, 0);
  assert.equal(geofence.geofenceRadiusMeters, 100);
  assert.throws(() => service.evaluateEvidence({ name: 'Purwokerto', latitude: -7.4253, longitude: 109.2397, radiusMeters: 10 }, { ...evidence(), latitude: -7.4353 }, 'employee-1', 'GEOFENCE'), /Di luar radius/);
  const mobile = service.evaluateEvidence({ name: 'Mobile assignment', latitude: -8, longitude: 110, radiusMeters: 1 }, evidence(), 'employee-1', 'MOBILE');
  assert.equal(mobile.distance, null);
  assert.equal(mobile.geofenceLatitude, null);
  assert.equal(mobile.geofenceRadiusMeters, null);
  const inaccurate = service.evaluateEvidence({ name: 'Mobile assignment', latitude: -8, longitude: 110, radiusMeters: 1 }, { ...evidence(), accuracyMeters: 150 }, 'employee-1', 'MOBILE');
  assert.equal(inaccurate.needsReview, true);
  const missingAccuracy = service.evaluateEvidence({ name: 'Mobile assignment', latitude: -8, longitude: 110, radiusMeters: 1 }, { ...evidence(), accuracyMeters: undefined }, 'employee-1', 'MOBILE');
  assert.equal(missingAccuracy.needsReview, true);
});

test('consolidated UAT allows only ADMIN_HR own attendance review and audits it distinctly', async () => {
  const audits = [];
  const record = { id: 'attendance-1', employee: { id: 'employee-1', employmentType: 'TENAGA_ARSIPARIS' }, location: {}, validationStatus: 'NEEDS_REVIEW', payableStatus: 'PENDING_REVIEW', checkInAt: new Date(), checkOutAt: new Date(), checkOutSource: 'EMPLOYEE' };
  const prisma = {
    attendance: { findUnique: async () => record, update: () => ({}) },
    attendanceReview: { create: () => ({}) },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
    $transaction: async () => [{ id: 'review-1' }, { ...record, validationStatus: 'APPROVED_AFTER_REVIEW' }],
  };
  const service = new AttendanceService(prisma, { record: async (entry) => audits.push(entry) }, { assertEmployee: async () => {} });
  await service.review('attendance-1', { decision: 'APPROVED', note: 'Bukti diri tervalidasi' }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(audits[0].action, 'ATTENDANCE_SELF_REVIEW');
  assert.equal(audits[0].actorRole, 'ADMIN_HR');
  assert.equal(audits[0].newValue.selfReview, true);
  assert.equal(audits[0].relatedEntityId, 'review-1');
  await assert.rejects(() => service.review('attendance-1', { decision: 'APPROVED', note: 'Tidak boleh' }, { userId: 'coordinator-1', role: 'KOORDINATOR' }), /sendiri/);
  await assert.rejects(() => service.review('attendance-1', { decision: 'APPROVED', note: 'Tidak boleh' }, { userId: 'system-1', role: 'SYSTEM_ADMIN' }), /sendiri/);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.review), ['ADMIN_HR', 'SYSTEM_ADMIN', 'KOORDINATOR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, AttendanceController.prototype.reviewAudit), ['DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN']);
});

test('consolidated UAT monitoring is people-first, attendance-eligible, and Coordinator scoped', async () => {
  let employeeQuery;
  const day = new Date('2026-09-09');
  const location = { id: 'location-1', name: 'Purwokerto', address: 'Address', checkInTime: '08:00', checkOutTime: '16:00', workDays: [day.getDay()] };
  const employee = (id, attendance) => ({ id, name: id, photoUrl: null, employmentType: 'TENAGA_ARSIPARIS', jobTitle: null, status: 'ACTIVE', placements: [{ id: `placement-${id}`, startDate: day, endDate: null, locationId: location.id, location }], temporaryAssignments: [], leaveRequests: [], attendances: attendance ? [attendance] : [] });
  const prisma = {
    employee: { findMany: async (query) => { employeeQuery = query; return [employee('present', { id: 'attendance-1', checkInAt: day, checkOutAt: null, latenessStatus: 'ON_TIME', validationStatus: 'VALID', reviews: [] }), employee('missing', null)]; } },
    holiday: { findMany: async () => [] },
  };
  const service = new AttendanceService(prisma, {}, { employeeWhere: async () => ({ employmentType: { in: ['TENAGA_ARSIPARIS'] } }) });
  const result = await service.monitoring({ date: '2026-09-09', employmentType: 'TENAGA_ARSIPARIS' }, { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(employeeQuery.where.attendanceRequired, true);
  assert.deepEqual(employeeQuery.where.status.in, ['TRAINING', 'ACTIVE', 'ON_LEAVE']);
  assert.deepEqual(employeeQuery.where.AND, [{ employmentType: { in: ['TENAGA_ARSIPARIS'] } }, { employmentType: 'TENAGA_ARSIPARIS' }]);
  assert.equal(result.people.length, 2);
  assert.equal(result.summary.attended, 1);
  assert.equal(result.summary.notAttended, 1);
  assert.equal(result.people.find((person) => person.employee.id === 'missing').state, 'NOT_ATTENDED');
});

test('consolidated UAT location configuration is data-driven, validated, editable, and audited', async () => {
  const audits = [];
  let created;
  const prisma = {
    location: {
      findFirst: async () => null,
      create: async ({ data }) => { created = { id: 'location-1', isActive: true, ...data }; return created; },
      findUnique: async () => created,
      update: async ({ data }) => ({ ...created, ...data }),
    },
  };
  const service = new LocationsService(prisma, { record: async (entry) => audits.push(entry) });
  const hr = { userId: 'hr-1', role: 'ADMIN_HR' };
  await assert.rejects(() => service.create({ name: 'Incomplete' }, hr), /koordinat geofence/);
  await service.create({ name: 'Operational', address: 'Real address', latitude: -7.4253, longitude: 109.2397, radiusMeters: 150 }, hr);
  await service.update('location-1', { radiusMeters: 200 }, hr);
  assert.equal(audits[0].action, 'LOCATION_CREATE');
  assert.equal(audits[1].action, 'LOCATION_UPDATE');
  assert.equal(audits[1].oldValue.radiusMeters, 150);
  assert.equal(audits[1].newValue.radiusMeters, 200);
});

test('consolidated UAT uses one global eligibility-gated capture overlay with mode-specific presentation', () => {
  const shell = frontend('components/AppShell.tsx');
  const attendance = frontend('app/(dashboard)/attendance/page.tsx');
  const monitor = frontend('components/attendance/PeopleAttendanceMonitoring.tsx');
  assert.match(shell, /attendanceEnabled=\{canAttend\(session\)\}/);
  assert.match(shell, /AttendancePresentationProvider/);
  assert.match(shell, /attendance-updated/);
  assert.match(shell, /onClick=\{onAttendance\}/);
  assert.doesNotMatch(shell, /key="attendance-center" href=/);
  assert.match(attendance, /presentation\.captureOnly.*SelfCheckIn.*autoStart/s);
  assert.match(attendance, /maximumAge: 0/);
  assert.match(attendance, /QUEUE_KEY}:\$\{session\.employee\?\.id/);
  assert.match(attendance, /err\.status === 403.*err\.status === 429.*err\.status >= 500/);
  assert.match(attendance, /data absensi offline ditolak server/);
  assert.match(attendance, /showGeofence=\{!isMobile\}/);
  assert.match(monitor, /\/attendance\/monitoring/);
  assert.match(monitor, /NOT_ATTENDED/);
  assert.match(monitor, /AttendanceDetailView/);
  const navigation = frontend('lib/navigation.ts');
  assert.match(navigation, /label: 'Payroll'.*ADMIN_HR.*KEUANGAN.*DIREKTUR/);
  assert.match(navigation, /label: 'Slip Gaji Saya'.*roles: all.*requiresEmployee: true/);
  assert.match(frontend('components/management/ManagementHome.tsx'), /attendance-updated/);
  assert.match(frontend('components/phase4/RoleHomes.tsx'), /attendance-updated/);
  assert.match(frontend('components/attendance/AttendanceHistoryView.tsx'), /attendance-updated/);
});

test('consolidated UAT resolves checkout against the prior attendance day only for overnight schedules', async () => {
  const checkOutAt = new Date();
  checkOutAt.setDate(checkOutAt.getDate() - 1);
  checkOutAt.setHours(1, 0, 0, 0);
  const checkInAt = new Date(checkOutAt);
  checkInAt.setDate(checkInAt.getDate() - 1);
  checkInAt.setHours(23, 0, 0, 0);
  const attendanceDate = new Date(checkInAt);
  attendanceDate.setHours(0, 0, 0, 0);
  const location = { id: 'location-1', name: 'Night site', isActive: true, deletedAt: null, latitude: -7.4253, longitude: 109.2397, radiusMeters: 100, workDays: [attendanceDate.getDay()], checkInTime: '23:00', checkOutTime: '01:00' };
  const employee = { id: 'employee-1', attendanceRequired: true, attendanceMode: 'GEOFENCE', placements: [{ status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: null, locationId: location.id, location }], temporaryAssignments: [] };
  const existing = { id: 'attendance-1', employeeId: employee.id, date: attendanceDate, checkInAt, checkOutAt: null, checkInAttendanceMode: 'GEOFENCE', validationStatus: 'VALID', location };
  let lookup = 0;
  let updated;
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    leaveRequest: { findFirst: async () => null },
    holiday: { findFirst: async () => null },
    attendance: {
      findUnique: async () => (++lookup === 1 ? null : existing),
      update: async ({ data }) => { updated = data; return { ...existing, ...data, employee }; },
    },
  }, { record: async () => {} }, {});
  await service.checkOut({ ...evidence(), clientRecordedAt: checkOutAt.toISOString() }, { userId: 'user-1', role: 'KARYAWAN' });
  assert.equal(lookup, 2);
  assert.equal(updated.checkOutAt.getTime(), checkOutAt.getTime());
});

test('consolidated UAT preserves placement history and authority boundaries', () => {
  const placement = fs.readFileSync(path.join(root, 'backend/src/placement-requests/placement-requests.service.ts'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'backend/src/placement-requests/placement-requests.controller.ts'), 'utf8');
  assert.match(placement, /status: 'ENDED'.*endDate/s);
  assert.match(placement, /placement\.create/);
  assert.doesNotMatch(placement, /placement\.delete/);
  assert.match(controller, /Role\.KOORDINATOR, Role\.ADMIN_HR, Role\.SYSTEM_ADMIN[\s\S]*@Post\(\)/);
  assert.match(controller, /Role\.DIREKTUR, Role\.SYSTEM_ADMIN[\s\S]*directorApprove/);
});

test('consolidated UAT bounds offline event time and keeps Director employee data redacted', () => {
  const attendance = new AttendanceService({}, {}, {});
  assert.throws(() => attendance.resolveEventTime(new Date(Date.now() + 10 * 60 * 1000).toISOString()), /masa depan/);
  assert.throws(() => attendance.resolveEventTime(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()), /lebih dari 7 hari/);
  const employees = new EmployeesService({}, {});
  const projected = employees.present({ id: 'employee-1', name: 'Employee', employmentType: 'TENAGA_ARSIPARIS', bankAccountNumber: 'secret', bpjsKesehatanNumber: 'secret', nik: 'secret', dailyRate: 100000, contracts: [{ baseSalary: 1 }], placements: [] }, { userId: 'director-1', role: 'DIREKTUR' });
  assert.equal(projected.name, 'Employee');
  assert.equal(projected.bankAccountNumber, undefined);
  assert.equal(projected.nik, undefined);
  assert.equal(projected.dailyRate, undefined);
  assert.equal(projected.contracts, undefined);
});
