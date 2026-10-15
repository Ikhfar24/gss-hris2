const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { EmployeesService } = require('../dist/employees/employees.service');
const { ReportsService } = require('../dist/reports/reports.service');
const { CompanySettingsController } = require('../dist/company-settings/company-settings.controller');
const { EmployeeProfileChangeRequestsController } = require('../dist/employee-profile-change-requests/employee-profile-change-requests.controller');

const hr = { userId: 'hr-1', email: 'hr@example.test', role: 'ADMIN_HR' };
const coordinator = { userId: 'coordinator-1', email: 'coordinator@example.test', role: 'KOORDINATOR' };

function employeeService() {
  const audits = [];
  const profileChanges = [];
  const before = {
    id: 'employee-1', name: 'Nama Lama', employeeNumber: 'NIP-OLD', nik: 'NIK-OLD',
    phone: '0800', address: 'Alamat Lama', email: 'old@example.test', jobTitle: 'Staff',
    attendanceRequired: true, attendanceExemptionReason: null, user: null,
  };
  const tx = {
    employee: {
      findUnique: async () => before,
      findFirst: async () => null,
      update: async ({ data }) => ({ ...before, ...data }),
    },
    user: { updateMany: async () => undefined },
    auditLog: { create: async ({ data }) => audits.push(data) },
    employeeProfileChangeRequest: { create: async (data) => profileChanges.push(data) },
  };
  return { service: new EmployeesService({ $transaction: async (callback) => callback(tx) }, {}), audits, profileChanges };
}

test('UAT Fix Pack 04 allows HR to update supported Employee master identity and profile fields', async () => {
  const { service } = employeeService();
  const result = await service.update('employee-1', {
    name: 'Nama Baru', employeeNumber: 'NIP-NEW', nik: 'NIK-NEW', phone: '0811',
    address: 'Alamat Baru', email: 'new@example.test', jobTitle: 'Supervisor', reason: 'Koreksi master HR',
  }, hr);
  assert.equal(result.name, 'Nama Baru');
  assert.equal(result.employeeNumber, 'NIP-NEW');
  assert.equal(result.nik, 'NIK-NEW');
});

test('UAT Fix Pack 04 audits HR master edits without raw NIP/NIK or fabricated profile requests', async () => {
  const { service, audits, profileChanges } = employeeService();
  await service.update('employee-1', { employeeNumber: 'NIP-SECRET', nik: 'NIK-SECRET', reason: 'Koreksi identitas' }, hr);
  assert.equal(audits[0].actorId, 'hr-1');
  assert.equal(audits[0].actorRole, 'ADMIN_HR');
  assert.equal(audits[0].entityId, 'employee-1');
  assert.deepEqual(audits[0].newValue.fields.sort(), ['employeeNumber', 'nik']);
  assert.doesNotMatch(JSON.stringify(audits[0]), /NIP-SECRET|NIK-SECRET/);
  assert.equal(profileChanges.length, 0);
});

test('UAT Fix Pack 04 keeps payroll/finalized financial fields outside Employee master DTO', () => {
  const dto = fs.readFileSync('src/employees/dto/update-employee.dto.ts', 'utf8');
  for (const field of ['payrollRunId', 'netPay', 'paymentStatus', 'finalizedAt']) assert.doesNotMatch(dto, new RegExp(`\\b${field}\\??:`));
});

test('UAT Fix Pack 04 preserves Profile Change Request self-service as Karyawan-only', () => {
  const roles = Reflect.getMetadata('roles', EmployeeProfileChangeRequestsController.prototype.create);
  assert.deepEqual(roles, ['KARYAWAN']);
  for (const role of ['KOORDINATOR', 'KEUANGAN', 'MARKETING']) assert.equal(roles.includes(role), false);
});

test('UAT Fix Pack 04 generates a scoped Coordinator PDF report', async () => {
  let where;
  const service = new ReportsService({ attendance: { findMany: async (query) => { where = query.where; return []; } } }, {
    queryWhere: async () => ({ employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } }),
  });
  const result = await service.exportAttendance({ format: 'pdf' }, coordinator);
  assert.equal(result.mime, 'application/pdf');
  assert.equal(result.buffer.subarray(0, 4).toString(), '%PDF');
  assert.deepEqual(where.employee, { employmentType: { in: ['TENAGA_BORONGAN'] } });
});

test('UAT Fix Pack 04 generates an organization-authorized HR PDF without sensitive report columns', async () => {
  let where;
  const service = new ReportsService({ attendance: { findMany: async (query) => { where = query.where; return []; } } }, {});
  const result = await service.exportAttendance({ format: 'pdf' }, hr);
  assert.equal(result.mime, 'application/pdf');
  assert.equal(result.buffer.subarray(0, 4).toString(), '%PDF');
  assert.equal(where.employee, undefined);
  const reportSource = fs.readFileSync('src/reports/reports.service.ts', 'utf8');
  for (const field of ['bankAccountNumber', 'bpjsKesehatanNumber', 'bpjsKetenagakerjaanNumber', 'dailyRate', 'baseSalary']) assert.doesNotMatch(reportSource, new RegExp(`select:[^;]*${field}`));
});

test('UAT Fix Pack 04 makes Company Settings GET and PATCH System Admin-only', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', CompanySettingsController), ['SYSTEM_ADMIN']);
  const calls = [];
  const controller = new CompanySettingsController({ get: async () => ({ companyName: 'GSS' }), update: async (dto, id) => { calls.push({ dto, id }); return dto; } });
  assert.equal((await controller.get()).companyName, 'GSS');
  await controller.update({ companyName: 'Baru' }, { userId: 'system-1', role: 'SYSTEM_ADMIN' });
  assert.equal(calls[0].id, 'system-1');
});

test('UAT Fix Pack 04 excludes every non-System Admin role from Company Settings authorization', () => {
  const allowed = Reflect.getMetadata('roles', CompanySettingsController);
  for (const role of ['ADMIN_HR', 'KOORDINATOR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'KARYAWAN']) assert.equal(allowed.includes(role), false);
});

test('UAT Fix Pack 04 keeps settings navigation and page access System Admin-only and hydration-safe', () => {
  const layout = fs.readFileSync('../frontend/app/(dashboard)/layout.tsx', 'utf8');
  const navigation = fs.readFileSync('../frontend/lib/navigation.ts', 'utf8');
  const page = fs.readFileSync('../frontend/app/(dashboard)/settings/page.tsx', 'utf8');
  assert.match(navigation, /href: '\/settings'.*roles: \['SYSTEM_ADMIN'\]/);
  assert.match(layout, /SessionProvider fallback=\{<AppShellSkeleton \/>\}/);
  assert.match(page, /session\.role !== 'SYSTEM_ADMIN'/);
  assert.match(page, /useSession\(\)/);
});

test('UAT Fix Pack 04 uses the shared authenticated file downloader for report PDF and Excel', () => {
  const page = fs.readFileSync('../frontend/app/(dashboard)/reports/page.tsx', 'utf8');
  assert.match(page, /downloadFile\(`\/reports\/\$\{reportKey\}\?\$\{params\.toString\(\)\}`/);
  assert.doesNotMatch(page, /URL\.createObjectURL/);
});
