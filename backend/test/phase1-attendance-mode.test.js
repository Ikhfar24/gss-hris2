const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { Prisma } = require('@prisma/client');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');

const { AttendanceService } = require('../dist/attendance/attendance.service');
const { CheckInDto } = require('../dist/attendance/dto/check-in.dto');
const { EmployeesService } = require('../dist/employees/employees.service');
const { CreateEmployeeDto } = require('../dist/employees/dto/create-employee.dto');

const location = {
  id: 'location-1', name: 'Administrasi Pusat', latitude: -6.2, longitude: 106.8,
  radiusMeters: 50, workDays: [0, 1, 2, 3, 4, 5, 6], checkInTime: '08:00', checkOutTime: '17:00', toleranceMin: 10,
};

function recentEventAt(hour) {
  const at = new Date();
  at.setDate(at.getDate() - 1);
  at.setHours(hour, 0, 0, 0);
  return at;
}

test('schema and migration add AttendanceMode while legacy event snapshots remain nullable', () => {
  const mode = Prisma.dmmf.datamodel.enums.find((entry) => entry.name === 'AttendanceMode');
  const employee = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'Employee');
  const attendance = Prisma.dmmf.datamodel.models.find((entry) => entry.name === 'Attendance');
  assert.deepEqual(mode.values.map((value) => value.name), ['GEOFENCE', 'MOBILE']);
  assert.equal(employee.fields.find((field) => field.name === 'attendanceMode').isRequired, true);
  assert.equal(attendance.fields.find((field) => field.name === 'checkInAttendanceMode').isRequired, false);
  assert.equal(attendance.fields.find((field) => field.name === 'checkOutAttendanceMode').isRequired, false);

  const sql = fs.readFileSync('prisma/migrations/20260908120000_phase1_attendance_mode/migration.sql', 'utf8');
  assert.match(sql, /"attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'GEOFENCE'/);
  assert.match(sql, /"checkInAttendanceMode" "AttendanceMode",/);
  assert.match(sql, /"checkOutAttendanceMode" "AttendanceMode";/);
  assert.doesNotMatch(sql, /UPDATE|DELETE|TRUNCATE|\bROLE\b/i);
});

test('GEOFENCE keeps radius enforcement and geofence snapshots unchanged', () => {
  const service = new AttendanceService({}, {}, {});
  assert.throws(() => service.evaluateEvidence(location, {
    latitude: -6.21, longitude: 106.81,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera gagal',
  }, 'employee-1', 'GEOFENCE'), /Di luar radius/);

  const evidence = service.evaluateEvidence(location, {
    latitude: -6.2001, longitude: 106.8, accuracyMeters: 12,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera gagal',
  }, 'employee-1', 'GEOFENCE');
  assert.ok(evidence.distance > 10);
  assert.equal(evidence.geofenceLatitude, location.latitude);
  assert.equal(evidence.geofenceLongitude, location.longitude);
  assert.equal(evidence.geofenceRadiusMeters, 50);
});

test('MOBILE requires complete GPS even with a failure declaration', () => {
  const service = new AttendanceService({}, {}, {});
  assert.throws(() => service.evaluateEvidence(location, {
    failureReason: 'GPS_FAILED', failureNote: 'GPS tidak tersedia',
  }, 'employee-1', 'MOBILE'), /MOBILE mewajibkan latitude dan longitude/);
  assert.throws(() => service.evaluateEvidence(location, {
    latitude: null, longitude: null, failureReason: 'GPS_FAILED', failureNote: 'GPS tidak tersedia',
  }, 'employee-1', 'MOBILE'), /MOBILE mewajibkan latitude dan longitude/);
});

test('employee attendanceMode input is enum validated', () => {
  const dto = plainToInstance(CreateEmployeeDto, {
    name: 'Employee', employmentType: 'TENAGA_BORONGAN', joinDate: '2026-09-08', attendanceMode: 'BY_ROLE',
  });
  const errors = validateSync(dto);
  assert.ok(errors.some((error) => error.property === 'attendanceMode' && error.constraints?.isEnum));
});

test('MOBILE skips radius and persists coordinates, accuracy, evidence, administrative location, and mode snapshot', async () => {
  let persisted;
  const employee = {
    id: 'employee-1', attendanceRequired: true, attendanceMode: 'MOBILE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2025-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  const prisma = {
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    leaveRequest: { findFirst: async () => null },
    attendance: {
      findUnique: async () => null,
      upsert: async ({ create }) => {
        persisted = create;
        return { id: 'attendance-1', ...create, employee: { id: employee.id }, location };
      },
    },
    holiday: { findFirst: async () => null },
  };
  const service = new AttendanceService(prisma, { record: async () => {} }, {});
  await service.checkIn({
    latitude: -7.5, longitude: 110.2, accuracyMeters: 27,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera rusak',
    clientRecordedAt: recentEventAt(8).toISOString(),
  }, { userId: 'user-1', role: 'KARYAWAN' });

  assert.equal(persisted.checkInLatitude, -7.5);
  assert.equal(persisted.checkInLongitude, 110.2);
  assert.equal(persisted.checkInAccuracyMeters, 27);
  assert.equal(persisted.checkInDistanceMeters, null);
  assert.equal(persisted.checkInGeofenceLatitude, null);
  assert.equal(persisted.checkInGeofenceLongitude, null);
  assert.equal(persisted.checkInGeofenceRadiusMeters, null);
  assert.equal(persisted.checkInLocationName, 'Administrasi Pusat');
  assert.equal(persisted.checkInFailureReason, 'CAMERA_FAILED');
  assert.equal(persisted.checkInFailureNote, 'Kamera rusak');
  assert.equal(persisted.checkInAttendanceMode, 'MOBILE');
});

test('attendanceRequired false remains ineligible before evidence handling', async () => {
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
    employee: { findUnique: async () => ({ id: 'employee-1', attendanceRequired: false, attendanceMode: 'MOBILE', placements: [], temporaryAssignments: [] }) },
  }, {}, {});
  await assert.rejects(() => service.checkIn({ clientRecordedAt: recentEventAt(8).toISOString() }, { userId: 'user-1', role: 'KARYAWAN' }), /tidak diwajibkan melakukan absensi/);
});

test('checkout snapshots the governing mode and preserves mobile evidence', async () => {
  let persisted;
  const employee = {
    id: 'employee-1', attendanceRequired: true, attendanceMode: 'MOBILE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2025-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  const existing = {
    id: 'attendance-1', employeeId: employee.id, locationId: location.id, location,
    date: (() => { const date = recentEventAt(8); date.setHours(0, 0, 0, 0); return date; })(),
    checkInAt: recentEventAt(8), checkOutAt: null,
    checkInAttendanceMode: 'MOBILE',
    validationStatus: 'VALID', checkInSelfieUrl: null, checkOutSelfieUrl: null,
  };
  const prisma = {
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    leaveRequest: { findFirst: async () => null },
    attendance: {
      findUnique: async () => existing,
      update: async ({ data }) => {
        persisted = data;
        return { ...existing, ...data, employee: { id: employee.id } };
      },
    },
    holiday: { findFirst: async () => null },
  };
  const service = new AttendanceService(prisma, { record: async () => {} }, {});
  await service.checkOut({
    latitude: -7.6, longitude: 110.3, accuracyMeters: 31,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera rusak',
    clientRecordedAt: recentEventAt(17).toISOString(),
  }, { userId: 'user-1', role: 'MARKETING' });

  assert.equal(persisted.checkOutAttendanceMode, 'MOBILE');
  assert.equal(persisted.checkOutLatitude, -7.6);
  assert.equal(persisted.checkOutLongitude, 110.3);
  assert.equal(persisted.checkOutAccuracyMeters, 31);
  assert.equal(persisted.checkOutDistanceMeters, null);
  assert.equal(persisted.checkOutGeofenceLatitude, null);
  assert.equal(persisted.checkOutGeofenceLongitude, null);
  assert.equal(persisted.checkOutGeofenceRadiusMeters, null);
  assert.equal(persisted.checkOutLocationName, 'Administrasi Pusat');
  assert.equal(persisted.checkOutFailureReason, 'CAMERA_FAILED');
});

test('myToday exposes the employee mode without deriving it from account role', async () => {
  const employee = {
    id: 'employee-1', attendanceRequired: true, attendanceMode: 'MOBILE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2025-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    placement: { findMany: async () => [] },
    attendance: { findUnique: async () => null },
    leaveRequest: { findFirst: async () => null },
    holiday: { findFirst: async () => null },
  }, {}, {});
  const response = await service.myToday({ userId: 'user-1', role: 'KARYAWAN' });
  assert.equal(response.attendanceMode, 'MOBILE');
});

test('an open attendance keeps its check-in mode when Employee configuration changes', async () => {
  const employee = {
    id: 'employee-1', attendanceRequired: true, attendanceMode: 'MOBILE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2025-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  const existing = {
    id: 'attendance-1', employeeId: employee.id, locationId: location.id, location,
    checkInAt: recentEventAt(8), checkOutAt: null,
    checkInAttendanceMode: 'GEOFENCE', validationStatus: 'VALID',
  };
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    leaveRequest: { findFirst: async () => null },
    attendance: { findUnique: async () => existing },
  }, {}, {});
  await assert.rejects(() => service.checkOut({
    latitude: -7.5, longitude: 110.2,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera rusak',
    clientRecordedAt: recentEventAt(17).toISOString(),
  }, { userId: 'user-1', role: 'KARYAWAN' }), /Di luar radius/);
});

test('a legacy open attendance with a null mode keeps the pre-migration geofence policy', async () => {
  const employee = {
    id: 'employee-1', attendanceRequired: true, attendanceMode: 'MOBILE',
    placements: [{ status: 'ACTIVE', startDate: new Date('2025-01-01'), endDate: null, locationId: location.id, location }],
    temporaryAssignments: [],
  };
  const existing = {
    id: 'legacy-attendance', employeeId: employee.id, locationId: location.id, location,
    checkInAt: recentEventAt(8), checkOutAt: null,
    checkInAttendanceMode: null, validationStatus: 'VALID',
  };
  const service = new AttendanceService({
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    leaveRequest: { findFirst: async () => null },
    attendance: { findUnique: async () => existing },
  }, {}, {});
  await assert.rejects(() => service.checkOut({
    latitude: -7.5, longitude: 110.2,
    failureReason: 'CAMERA_FAILED', failureNote: 'Kamera rusak',
    clientRecordedAt: recentEventAt(17).toISOString(),
  }, { userId: 'user-1', role: 'KARYAWAN' }), /Di luar radius/);
  assert.equal(existing.checkInAttendanceMode, null);
});

test('only ADMIN_HR can explicitly configure attendanceMode and the change is sensitive and audited', async () => {
  const before = {
    id: 'employee-1', attendanceMode: 'GEOFENCE', attendanceRequired: true,
    attendanceExemptionReason: null, user: null, placements: [], contracts: [],
  };
  let audit;
  const tx = {
    employee: {
      findUnique: async () => before,
      update: async ({ data }) => ({ ...before, ...data }),
    },
    auditLog: { create: async ({ data }) => { audit = data; } },
  };
  const service = new EmployeesService({ $transaction: async (work) => work(tx) }, {});
  const updated = await service.update('employee-1', { attendanceMode: 'MOBILE', reason: 'Tugas lapangan' }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(updated.attendanceMode, 'MOBILE');
  assert.equal(audit.action, 'EMPLOYEE_SENSITIVE_UPDATE');
  assert.equal(audit.oldValue.profile.attendanceMode, 'GEOFENCE');
  assert.equal(audit.newValue.profile.attendanceMode, 'MOBILE');
  assert.equal(audit.reason, 'Tugas lapangan');

  await assert.rejects(() => service.update('employee-1', { attendanceMode: 'MOBILE', reason: 'System change' }, { userId: 'system-1', role: 'SYSTEM_ADMIN' }), /Hanya Admin HR/);
  await assert.rejects(() => service.create({ attendanceMode: 'MOBILE' }, { userId: 'system-1', role: 'SYSTEM_ADMIN' }), /Hanya Admin HR/);
  await assert.rejects(() => service.import({ rows: [{ attendanceMode: 'MOBILE' }] }, { userId: 'system-1', role: 'SYSTEM_ADMIN' }), /Hanya Admin HR/);
});

test('CoordinatorScope attendance filtering is unaffected by attendance mode', async () => {
  let where;
  const service = new AttendanceService({
    attendance: { findMany: async (args) => { where = args.where; return []; } },
  }, {}, { queryWhere: async () => ({ employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } }) });
  await service.findAll({}, { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.deepEqual(where.employee, { employmentType: { in: ['TENAGA_BORONGAN'] } });
  assert.equal('attendanceMode' in where, false);
});

test('attendance requires no browser identifier and changing phones has no service effect', () => {
  const dto = plainToInstance(CheckInDto, {
    latitude: -6.2,
    longitude: 106.8,
    accuracyMeters: 10,
    failureReason: 'CAMERA_FAILED',
    failureNote: 'Kamera tidak tersedia',
  });
  assert.deepEqual(validateSync(dto), []);

  const dtoSource = fs.readFileSync('src/attendance/dto/check-in.dto.ts', 'utf8');
  const serviceSource = fs.readFileSync('src/attendance/attendance.service.ts', 'utf8');
  assert.doesNotMatch(dtoSource, /deviceId|deviceInfo|browser identifier/i);
  assert.doesNotMatch(serviceSource, /deviceId|deviceInfo|employeeDevice|device binding/i);
});
