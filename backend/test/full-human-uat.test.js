const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');

const { parseImportXlsx } = require('../dist/common/utils/xlsx-import.util');
const { ClientsController } = require('../dist/clients/clients.controller');
const { ClientsService } = require('../dist/clients/clients.service');
const { LocationsController } = require('../dist/locations/locations.controller');
const { LocationsService } = require('../dist/locations/locations.service');
const { EmployeesController } = require('../dist/employees/employees.controller');
const { EmployeesService } = require('../dist/employees/employees.service');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { AttendanceService } = require('../dist/attendance/attendance.service');
const { HolidaysService } = require('../dist/holidays/holidays.service');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');
const { UsersService } = require('../dist/users/users.service');

const hr = { userId: 'hr-1', role: 'ADMIN_HR' };

async function uploadWithRows(template, rows) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values.slice(1);
  for (const values of rows) sheet.addRow(headers.map((header) => values[header]));
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: 'import.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

test('all XLSX endpoints are restricted to ADMIN_HR and SYSTEM_ADMIN', () => {
  for (const [controller, methods] of [
    [ClientsController, ['importTemplate', 'importPreview', 'importCommit']],
    [LocationsController, ['importTemplate', 'importPreview', 'importCommit']],
    [EmployeesController, ['importTemplate', 'importPreview', 'importCommit']],
  ]) {
    for (const method of methods) assert.deepEqual(Reflect.getMetadata(ROLES_KEY, controller.prototype[method]), ['ADMIN_HR', 'SYSTEM_ADMIN']);
  }
});

test('shared XLSX parser rejects formulas and files over 5MB', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(['name']);
  sheet.addRow([{ formula: '1+1', result: 2 }]);
  const file = { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: 'formula.xlsx' };
  const parsed = await parseImportXlsx(file, [{ key: 'name', type: 'string', required: true }]);
  assert.match(parsed[0].errors.join(' '), /formula tidak diizinkan/);
  await assert.rejects(() => parseImportXlsx({ buffer: Buffer.alloc(5 * 1024 * 1024 + 1), originalname: 'large.xlsx' }, [{ key: 'name', type: 'string' }]), /maksimal 5MB/);
});

test('client preview applies insert-only, case-insensitive duplicate validation', async () => {
  const service = new ClientsService({ client: { findMany: async () => [{ name: 'Acme' }] } }, {});
  const file = await uploadWithRows(await service.importTemplate(), [{ referenceCode: 'CL-ACME', name: 'ACME', isActive: true }, { referenceCode: 'CL-NEW-1', name: 'New Client', isActive: false }, { referenceCode: 'CL-NEW-2', name: 'new client' }]);
  const preview = await service.previewImport(file);
  assert.equal(preview.valid, false);
  assert.deepEqual(preview.errors.map((error) => error.row), [2, 4]);
  assert.match(preview.errors[0].errors.join(' '), /duplikat/);
});

test('location preview validates client references and active geofence configuration per row', async () => {
  const service = new LocationsService({
    client: { findMany: async () => [{ id: 'client-ok' }] },
    location: { findMany: async () => [] },
  }, {});
  const file = await uploadWithRows(await service.importTemplate(), [
    { referenceCode: 'LOC-UNKNOWN', name: 'Unknown client', clientReference: 'missing', latitude: -6.2, longitude: 106.8, isActive: true },
    { referenceCode: 'LOC-NO-GEOFENCE', name: 'No geofence', clientReference: 'client-ok', isActive: true },
    { referenceCode: 'LOC-STAGING', name: 'Inactive staging', clientReference: 'client-ok', isActive: false },
  ]);
  const preview = await service.previewImport(file);
  assert.equal(preview.valid, false);
  assert.deepEqual(preview.errors.map((error) => error.row), [2, 3]);
  assert.match(preview.errors[0].errors.join(' '), /clientReference tidak ditemukan/);
  assert.match(preview.errors[1].errors.join(' '), /koordinat geofence/);
  assert.equal(preview.rows[2].errors.length, 0);
});

test('employee preview accepts STAFF_OFFICE and reports invalid roles, refs, duplicates, and attendance eligibility', async () => {
  const service = new EmployeesService({
    employee: { findMany: async () => [{ nik: 'existing-nik', employeeNumber: null }] },
    location: { findMany: async () => [{ id: 'location-ok', referenceCode: 'LOC-OK' }] },
    user: { findMany: async () => [{ email: 'used@example.com' }] },
  });
  const file = await uploadWithRows(await service.importTemplate(), [
    { name: 'Valid office', nik: 'new-nik', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-10', initialLocationReference: 'LOC-OK', attendanceRequired: true, provisionUser: true, loginEmail: 'new@example.com', userRole: 'KARYAWAN' },
    { name: 'Invalid', nik: 'existing-nik', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-10', initialLocationReference: 'missing', attendanceRequired: false, provisionUser: true, loginEmail: 'used@example.com', userRole: 'ROOT' },
  ]);
  const preview = await service.previewXlsxImport(file);
  assert.equal(preview.rows[0].errors.length, 0);
  assert.equal(preview.valid, false);
  const errors = preview.rows[1].errors.join(' ');
  assert.match(errors, /NIK duplikat/);
  assert.match(errors, /initialLocationReference tidak ditemukan/);
  assert.match(errors, /attendanceExemptionReason/);
  assert.match(errors, /userRole/);
  assert.match(errors, /loginEmail duplikat/);
});

test('employee commit provisions user transactionally, hashes a strong password, and audits only counts', async () => {
  const writes = { employees: [], users: [], audits: [] };
  const prisma = {
    employee: { findMany: async () => [] },
    location: { findMany: async () => [{ id: 'location-ok', referenceCode: 'LOC-OK' }] },
    user: { findMany: async () => [] },
    $transaction: async (callback) => callback({
      employee: { create: async ({ data }) => { writes.employees.push(data); return { id: 'employee-1', name: data.name }; } },
      user: { create: async ({ data }) => { writes.users.push(data); return { id: 'user-1' }; } },
      auditLog: { create: async ({ data }) => writes.audits.push(data) },
    }),
  };
  const service = new EmployeesService(prisma, {}, {
    generatePassword: () => 'StrongTemporaryPassword9!ABcd',
    store: async (_tx, userId, plaintext, purpose) => { writes.credential = { userId, plaintext, purpose }; },
  });
  const file = await uploadWithRows(await service.importTemplate(), [{
    name: 'Imported Office', employeeNumber: 'OFF-1', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-10', initialLocationReference: 'LOC-OK',
    attendanceRequired: false, attendanceExemptionReason: 'Executive exemption', provisionUser: true, loginEmail: 'Office@example.com', userRole: 'DIREKTUR',
  }]);
  const result = await service.commitXlsxImport(file, hr);
  assert.equal(result.created, 1);
  assert.equal(result.provisionedUsers, 1);
  assert.equal(result.credentials[0].email, 'office@example.com');
  assert.ok(result.credentials[0].temporaryPassword.length >= 28);
  assert.equal(await bcrypt.compare(result.credentials[0].temporaryPassword, writes.users[0].passwordHash), true);
  assert.equal(writes.employees[0].placements.create.locationId, 'location-ok');
  assert.equal(writes.credential.userId, 'user-1');
  assert.equal(writes.credential.purpose, 'EMPLOYEE_IMPORT');
  assert.deepEqual(writes.audits[0].newValue, { rowCount: 1, provisionedUserCount: 1 });
  assert.doesNotMatch(JSON.stringify(writes.audits), /password|office@example.com|OFF-1/i);
});

test('invalid employee commit performs no transaction or partial writes', async () => {
  let transactionCalled = false;
  const service = new EmployeesService({
    employee: { findMany: async () => [] }, location: { findMany: async () => [] }, user: { findMany: async () => [] },
    $transaction: async () => { transactionCalled = true; },
  });
  const file = await uploadWithRows(await service.importTemplate(), [{ name: 'Bad ref', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-10', initialLocationReference: 'missing' }]);
  await assert.rejects(() => service.commitXlsxImport(file, hr), /Import karyawan gagal divalidasi/);
  assert.equal(transactionCalled, false);
});

test('ADMIN_HR cannot provision or assign SYSTEM_ADMIN accounts', async () => {
  const users = new UsersService({});
  await assert.rejects(() => users.create({ name: 'Root', email: 'root@example.com', password: 'Temporary1!', role: 'SYSTEM_ADMIN' }, hr), /Hanya System Admin/);
  users.findOne = async () => ({ id: 'user-1', role: 'KARYAWAN', employeeId: null, isActive: true, employee: null });
  await assert.rejects(() => users.update('user-1', { role: 'SYSTEM_ADMIN', reason: 'Promote' }, hr), /Hanya System Admin/);
  users.findOne = async () => ({ id: 'root-1', role: 'SYSTEM_ADMIN', employeeId: null, isActive: true, employee: null });
  await assert.rejects(() => users.resetPassword('root-1', 'Replacement1!', 'Reset', hr), /Hanya System Admin/);
  await assert.rejects(() => users.deactivate('root-1', 'Deactivate', hr), /Hanya System Admin/);
  await assert.rejects(() => users.remove('root-1', 'Delete', hr), /Hanya System Admin/);

  let transactionCalled = false;
  const employees = new EmployeesService({
    employee: { findMany: async () => [] }, location: { findMany: async () => [] }, user: { findMany: async () => [] },
    $transaction: async () => { transactionCalled = true; },
  });
  const file = await uploadWithRows(await employees.importTemplate(), [{
    name: 'Root import', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-10', attendanceRequired: true,
    provisionUser: true, loginEmail: 'root@example.com', userRole: 'SYSTEM_ADMIN',
  }]);
  await assert.rejects(() => employees.commitXlsxImport(file, hr), /Hanya System Admin/);
  assert.equal(transactionCalled, false);
});

test('client detail query includes associated locations', async () => {
  let query;
  const service = new ClientsService({ client: { findUnique: async (value) => { query = value; return { id: 'client-1', locations: [] }; } } }, {});
  await service.findOne('client-1');
  assert.deepEqual(query.select.locations, { select: { id: true, referenceCode: true, name: true, address: true, isActive: true }, orderBy: { name: 'asc' } });
  assert.equal(query.select.locations.select.latitude, undefined);
});

test('Staff Kantor and client detail UX are propagated without field-placement wording', () => {
  const users = fs.readFileSync('../frontend/app/(dashboard)/users/page.tsx', 'utf8');
  const clients = fs.readFileSync('../frontend/app/(dashboard)/clients/page.tsx', 'utf8');
  const profile = fs.readFileSync('../frontend/components/employee/EmployeeFullProfile.tsx', 'utf8');
  const employeeHome = fs.readFileSync('../frontend/components/employee/EmployeeHome.tsx', 'utf8');
  const employeeList = fs.readFileSync('../frontend/app/(dashboard)/employees/page.tsx', 'utf8');
  const roleHomes = fs.readFileSync('../frontend/components/phase4/RoleHomes.tsx', 'utf8');
  const employment = fs.readFileSync('../frontend/lib/employment.ts', 'utf8');

  assert.match(users, /STAFF_OFFICE[^\n]+Staff Kantor/);
  assert.match(employment, /STAFF_OFFICE: 'Staff Kantor'/);
  assert.doesNotMatch([users, clients, profile, employeeHome, employeeList, roleHomes, employment].join('\n'), /Staff Office/);
  assert.match(profile, /isStaffOffice[\s\S]+Lokasi Kerja/);
  assert.match(profile, /isStaffOffice \? <Card>[\s\S]+: <Card id="placement">/);
  assert.match(clients, /apiFetch<ClientDetail>\(`\/clients\/\$\{client\.id\}`/);
  assert.match(clients, /Lokasi Terkait/);
  assert.match(employeeList, /EmployeeAvatar name=\{emp\.name\}/);
  assert.match(employeeList, /emp\.employeeNumber \?\? "NIP belum tersedia"/);
  assert.doesNotMatch(employeeList, /Aksi ada di profil/);
  assert.match(roleHomes, /label="Staff Kantor"[\s\S]+value=\{staffOffice\}/);
});

test('holiday creation enforces type and location consistency', async () => {
  let created;
  const service = new HolidaysService({ holiday: { create: async ({ data }) => { created = data; return { id: 'holiday-1', ...data }; } } }, { record: async () => {} });
  await assert.rejects(() => service.create({ date: '2026-09-10', name: 'Libur cabang', type: 'LOCATION_SPECIFIC' }, 'hr-1'), /wajib memilih lokasi/);
  await assert.rejects(() => service.create({ date: '2026-09-10', name: 'Libur nasional', type: 'NATIONAL', locationId: 'location-1' }, 'hr-1'), /hanya boleh diisi/);
  await service.create({ date: '2026-09-10', name: 'Libur cabang', type: 'LOCATION_SPECIFIC', locationId: 'location-1' }, 'hr-1');
  assert.equal(created.type, 'LOCATION_SPECIFIC');
  assert.equal(created.locationId, 'location-1');
});

test('myToday exposes authoritative holiday context and exceptional check-in remains reviewable', async () => {
  const location = { id: 'location-1', name: 'Kantor Pusat', latitude: -6.2, longitude: 106.8, radiusMeters: 250, workDays: [], checkInTime: '08:00', checkOutTime: '17:00', toleranceMin: 10 };
  const employee = { id: 'employee-1', attendanceRequired: true, attendanceMode: 'GEOFENCE', placements: [{ status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: null, locationId: location.id, location }], temporaryAssignments: [] };
  let persisted;
  const prisma = {
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    placement: { findMany: async () => [] },
    leaveRequest: { findFirst: async () => null },
    holiday: { findFirst: async () => ({ id: 'holiday-1', name: 'Hari UAT', type: 'LOCATION_SPECIFIC' }) },
    attendance: {
      findUnique: async () => null,
      upsert: async ({ create }) => { persisted = create; return { id: 'attendance-1', ...create, employee: { id: employee.id, name: 'UAT', employmentType: 'TETAP' }, location }; },
    },
  };
  const service = new AttendanceService(prisma, { record: async () => {} }, {});
  const today = await service.myToday({ userId: 'user-1', role: 'KARYAWAN' });
  assert.equal(today.nonWorkingDay.reason, 'HOLIDAY');
  assert.equal(today.nonWorkingDay.holiday.name, 'Hari UAT');

  await service.checkIn({ latitude: location.latitude, longitude: location.longitude, accuracyMeters: 10, failureReason: 'CAMERA_FAILED', failureNote: 'Kamera sedang rusak' }, { userId: 'user-1', role: 'KARYAWAN' });
  assert.equal(persisted.validationStatus, 'NEEDS_REVIEW');
  assert.equal(persisted.latenessStatus, 'NOT_APPLICABLE');
  assert.match(persisted.reviewNote, /hari libur: hari uat/i);
});

function attendanceFixture(overrides = {}) {
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const location = { id: 'location-1', name: 'Kantor UAT', latitude: -6.2, longitude: 106.8, radiusMeters: 100, workDays: [day.getDay()], checkInTime: '23:59', checkOutTime: '23:59', toleranceMin: 0 };
  const employee = { id: 'employee-1', attendanceRequired: true, attendanceMode: 'GEOFENCE', placements: [{ status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: null, locationId: location.id, location }], temporaryAssignments: [] };
  return { today: day, location, employee, ...overrides };
}

test('attendance validates duplicate and objective evidence failures before persistence', async () => {
  const { location, employee } = attendanceFixture();
  let duplicate = true;
  const prisma = {
    user: { findUnique: async () => ({ employeeId: employee.id }) },
    employee: { findUnique: async () => employee },
    placement: { findMany: async () => [] },
    leaveRequest: { findFirst: async () => null },
    attendance: { findUnique: async () => duplicate ? { id: 'existing', checkInAt: new Date() } : null },
  };
  const service = new AttendanceService(prisma, { record: async () => {} }, {});
  const actor = { userId: 'employee-user', role: 'KARYAWAN' };
  await assert.rejects(() => service.checkIn({}, actor), /Sudah melakukan check-in/);

  duplicate = false;
  await assert.rejects(() => service.checkIn({ latitude: 0, longitude: 0, failureReason: 'CAMERA_FAILED', failureNote: 'Kamera gagal' }, actor), /Di luar radius/);
});

test('coordinator can open own attendance detail before coordinator team scope is evaluated', async () => {
  let scopeCalled = false;
  const prisma = {
    attendance: { findUnique: async () => ({ id: 'attendance-own', employeeId: 'employee-coordinator', checkInSelfieUrl: null, checkOutSelfieUrl: null, employee: { id: 'employee-coordinator', employmentType: 'STAFF_OFFICE' }, location: {}, reviews: [] }) },
    user: { findUnique: async () => ({ employeeId: 'employee-coordinator' }) },
  };
  const service = new AttendanceService(prisma, {}, { assertEmployee: async () => { scopeCalled = true; throw new Error('scope must not run'); } });
  const detail = await service.findDetail('attendance-own', { userId: 'coordinator-user', role: 'KOORDINATOR' });
  assert.equal(detail.id, 'attendance-own');
  assert.equal(scopeCalled, false);
});

test('coordinator cannot approve own leave before team scope evaluation', async () => {
  let scopeCalled = false;
  let transactionCalled = false;
  const prisma = {
    leaveRequest: { findUnique: async () => ({ id: 'leave-own', employeeId: 'employee-coordinator', status: 'PENDING_COORDINATOR', type: 'CUTI', employee: { id: 'employee-coordinator', employmentType: 'STAFF_OFFICE' }, approvals: [] }) },
    user: { findUnique: async () => ({ employeeId: 'employee-coordinator' }) },
    $transaction: async () => { transactionCalled = true; },
  };
  const service = new LeaveRequestsService(prisma, { assertEmployee: async () => { scopeCalled = true; } });
  await assert.rejects(() => service.review('leave-own', { approve: true, note: 'Setuju' }, { userId: 'coordinator-user', role: 'KOORDINATOR' }), /tidak dapat menyetujui.*sendiri/i);
  assert.equal(scopeCalled, false);
  assert.equal(transactionCalled, false);
});

test('activity bell and employee-linked payslip navigation preserve personal and operational authority', () => {
  const shell = fs.readFileSync('../frontend/components/AppShell.tsx', 'utf8');
  const navigation = fs.readFileSync('../frontend/lib/navigation.ts', 'utf8');
  const activity = fs.readFileSync('../frontend/app/(dashboard)/activity/page.tsx', 'utf8');
  const payroll = fs.readFileSync('../frontend/app/(dashboard)/payroll/page.tsx', 'utf8');
  assert.match(shell, /href="\/activity" aria-label="Pusat Aktivitas"/);
  assert.doesNotMatch(shell, /dashboard#activity/);
  assert.match(navigation, /label: 'Payroll'.*roles: \['ADMIN_HR', 'KEUANGAN', 'DIREKTUR'\]/);
  assert.match(navigation, /label: 'Slip Gaji Saya'.*roles: all, requiresEmployee: true/);
  assert.match(shell, /!item\.requiresEmployee \|\| !!session\.employee/);
  assert.match(payroll, /searchParams\.get\('view'\) === 'mine' && session\.employee/);
  assert.match(activity, /PUSAT AKTIVITAS/);
  assert.match(activity, /PRIBADI/);
  assert.match(activity, /authorityLabel = session\.role === 'KOORDINATOR' \? 'TIM' : 'ORGANISASI'/);
  assert.match(activity, /\/attendance\/me\/history/);
});

test('map and global shell retain crash-safe bounds and dynamic viewport protections', () => {
  const map = fs.readFileSync('../frontend/components/AttendanceMap.tsx', 'utf8');
  const shell = fs.readFileSync('../frontend/components/AppShell.tsx', 'utf8');
  const dialog = fs.readFileSync('../frontend/components/ui/dialog.tsx', 'utf8');
  const globals = fs.readFileSync('../frontend/app/globals.css', 'utf8');
  const attendance = fs.readFileSync('../frontend/app/(dashboard)/attendance/page.tsx', 'utf8');
  const holidays = fs.readFileSync('../frontend/app/(dashboard)/holidays/page.tsx', 'utf8');
  assert.doesNotMatch(map, /\.getBounds\s*\(/);
  assert.match(map, /EARTH_RADIUS_METERS/);
  assert.match(map, /requestAnimationFrame/);
  assert.match(map, /map\.whenReady/);
  assert.match(map, /mapRef\.current !== map/);
  assert.doesNotMatch(shell, /(?:min-)?h-screen/);
  assert.match(shell, /min-h-dvh/);
  assert.match(shell, /safe-area-inset-left/);
  assert.match(globals, /min-height: 100dvh/);
  assert.match(globals, /overflow-x: clip/);
  assert.match(globals, /mobile-nav-clearance/);
  assert.match(dialog, /max-h-\[calc\(100dvh/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(dialog, /safe-area-inset-bottom/);
  assert.match(attendance, /Hari ini tidak ada jadwal kerja/);
  assert.match(holidays, /LOCATION_SPECIFIC/);
  assert.match(holidays, /calendarDays/);
});
