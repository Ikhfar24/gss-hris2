const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { AttendanceService } = require('../dist/attendance/attendance.service');

const location = {
  name: 'Gudang Utama', latitude: -6.200000, longitude: 106.816666,
  radiusMeters: 250,
};

test('UAT Fix Pack 06 recalculates distance and snapshots accuracy/geofence evidence on the server', () => {
  const service = new AttendanceService({}, {}, {});
  const evidence = service.evaluateEvidence(location, {
    latitude: -6.200100, longitude: 106.816666, accuracyMeters: 18,
    deviceId: 'device-123', failureReason: 'CAMERA_FAILED', failureNote: 'Kamera rusak',
  }, 'employee-1');
  assert.ok(evidence.distance > 10 && evidence.distance < 13);
  assert.equal(evidence.accuracy, 18);
  assert.equal(evidence.geofenceLatitude, location.latitude);
  assert.equal(evidence.geofenceLongitude, location.longitude);
  assert.equal(evidence.geofenceRadiusMeters, 250);
  assert.equal(evidence.locationName, 'Gudang Utama');
  assert.equal(evidence.gpsStatus, 'OK');
});

test('UAT Fix Pack 06 rejects incomplete coordinate pairs before attendance persistence', () => {
  const service = new AttendanceService({}, {}, {});
  assert.throws(() => service.evaluateEvidence(location, {
    latitude: -6.2, deviceId: 'device-123', failureReason: 'GPS_FAILED', failureNote: 'GPS gagal',
  }, 'employee-1'), /Latitude dan longitude harus dikirim bersama/);
});

test('UAT Fix Pack 06 permits a linked employee to open only their own attendance detail', async () => {
  const attendance = { id: 'attendance-1', employeeId: 'employee-1', employee: { id: 'employee-1', employmentType: 'TETAP' }, reviews: [], checkInSelfieUrl: null, checkOutSelfieUrl: null };
  const prisma = {
    attendance: { findUnique: async () => attendance },
    user: {
      findUnique: async ({ where }) => ({ employeeId: where.id === 'self-user' ? 'employee-1' : 'employee-2' }),
      findMany: async () => [],
    },
  };
  const service = new AttendanceService(prisma, {}, {});
  assert.equal((await service.findDetail('attendance-1', { userId: 'self-user', role: 'KARYAWAN' })).id, 'attendance-1');
  await assert.rejects(() => service.findDetail('attendance-1', { userId: 'other-user', role: 'KEUANGAN' }), /hanya dapat mengakses/);
});

test('UAT Fix Pack 06 applies active CoordinatorScope to attendance detail', async () => {
  let scopedEmployee;
  const attendance = { id: 'attendance-1', employeeId: 'employee-1', employee: { id: 'employee-1', employmentType: 'TENAGA_BORONGAN' }, reviews: [], checkInSelfieUrl: null, checkOutSelfieUrl: null };
  const service = new AttendanceService({ attendance: { findUnique: async () => attendance }, user: { findMany: async () => [] } }, {}, {
    assertEmployee: async (_userId, employee) => { scopedEmployee = employee; },
  });
  await service.findDetail('attendance-1', { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(scopedEmployee.employmentType, 'TENAGA_BORONGAN');

  const denied = new AttendanceService({ attendance: { findUnique: async () => attendance }, user: { findMany: async () => [] } }, {}, {
    assertEmployee: async () => { throw new Error('di luar CoordinatorScope aktif'); },
  });
  await assert.rejects(() => denied.findDetail('attendance-1', { userId: 'coordinator-2', role: 'KOORDINATOR' }), /CoordinatorScope aktif/);
});

test('UAT Fix Pack 06 migration is additive-only and keeps legacy evidence nullable', () => {
  const sql = fs.readFileSync('prisma/migrations/20260907150000_uat_fix_06_attendance_location_evidence/migration.sql', 'utf8');
  assert.match(sql, /ADD COLUMN "checkInAccuracyMeters" DOUBLE PRECISION/);
  assert.match(sql, /ADD COLUMN "checkOutLocationName" TEXT/);
  assert.doesNotMatch(sql, /NOT NULL|DROP|TRUNCATE|DELETE FROM/i);
});

test('UAT Fix Pack 06 tracks GPS only while Attendance is mounted and clears the watcher', () => {
  const page = fs.readFileSync('../frontend/app/(dashboard)/attendance/page.tsx', 'utf8');
  const map = fs.readFileSync('../frontend/components/AttendanceMap.tsx', 'utf8');
  assert.match(page, /navigator\.geolocation\.watchPosition/);
  assert.match(page, /return \(\) => navigator\.geolocation\.clearWatch\(watchId\)/);
  assert.match(page, /Submission always captures a fresh fix/);
  assert.match(page, /setPosition\(null\)/);
  assert.match(page, /accuracyMeters/);
  assert.match(page, /Lokasi diperbarui hanya selama halaman Absensi ini terbuka/);
  assert.match(page, /Lokasi historis tidak tersedia/);
  assert.match(page, /\/attendance\/\$\{id\}/);
  assert.match(map, /tile\.openstreetmap\.org/);
  assert.match(map, /L\.circle/);
});
