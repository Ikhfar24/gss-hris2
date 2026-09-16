const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { PayrollController } = require('../dist/payroll/payroll.controller');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');

const root = path.resolve(__dirname, '../..');
const frontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');

test('Phase 4 Director can inspect payroll decisions without receiving Finance authority', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.findAll), ['KEUANGAN', 'ADMIN_HR', 'DIREKTUR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.approve), ['DIREKTUR']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.review), ['KEUANGAN']);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PayrollController.prototype.payment), ['KEUANGAN']);
  let query;
  const service = new PayrollService({ payrollRun: { findMany: async (value) => { query = value; return []; } } }, { record: async () => {} });
  await service.findAll({ userId: 'director-1', role: 'DIREKTUR' });
  assert.deepEqual(Object.keys(query.select).sort(), ['_count', 'financeReviewedAt', 'id', 'periodEnd', 'periodStart', 'status']);
  await assert.rejects(() => service.review('run-1', { userId: 'director-1', role: 'DIREKTUR' }), /Keuangan/);
  await assert.rejects(() => service.findAll({ userId: 'admin-1', role: 'SYSTEM_ADMIN' }), /Keuangan/);
});

test('Phase 4 executive attendance denominator excludes attendance-exempt Employees', async () => {
  const employeeQueries = [];
  const count = async (query) => { employeeQueries.push(query); return 0; };
  const service = new DashboardService({ employee: { count }, attendance: { count }, leaveRequest: { count }, placementRequest: { count }, placement: { count } }, { employeeWhere: async () => ({}) });
  await service.summary({ userId: 'commissioner-1', role: 'KOMISARIS' });
  assert.equal(employeeQueries[0].where.attendanceRequired, true);
});

test('Phase 4 routes every target role to a distinct contract-backed workspace', () => {
  const dashboard = frontend('app/(dashboard)/dashboard/page.tsx');
  assert.match(dashboard, /MARKETING.*EmployeeHome capabilities="marketing"/s);
  assert.match(dashboard, /KEUANGAN.*FinanceHome/s);
  assert.match(dashboard, /DIREKTUR.*KOMISARIS.*ExecutiveHome/s);
  assert.match(dashboard, /SystemAdminHome/);
  assert.doesNotMatch(dashboard, /getUser|LegacyDashboard/);
});

test('Phase 4 Marketing is employee-only and uses authoritative MOBILE attendance configuration', () => {
  const home = frontend('components/employee/EmployeeHome.tsx');
  const navigation = frontend('lib/navigation.ts');
  const attendance = frontend('app/(dashboard)/attendance/page.tsx');
  assert.match(home, /capabilities === 'marketing'.*service\.label !== 'Lembur'/s);
  assert.match(home, /\/employees\/me\/360/);
  assert.match(navigation, /MARKETING:.*'\/attendance\/history'.*'\/profile'/);
  assert.doesNotMatch(navigation, /MARKETING:.*Tim|MARKETING:.*employees/s);
  assert.match(attendance, /today\.attendanceMode === 'MOBILE'/);
  assert.match(attendance, /maximumAge: 0/);
});

test('Phase 4 Finance home keeps personal attendance separate from payroll queues', () => {
  const homes = frontend('components/phase4/RoleHomes.tsx');
  assert.match(homes, /function FinanceHome/);
  assert.match(homes, /\/attendance\/me\/today/);
  assert.match(homes, /\/payroll\/runs/);
  assert.match(homes, /Hanya antrean Finance/);
  assert.doesNotMatch(homes.slice(homes.indexOf('export function FinanceHome'), homes.indexOf('export function ExecutiveHome')), /tidakHadir|organization|CoordinatorScope/);
});

test('Phase 4 payroll presents responsive detail and dialog-confirmed Director decisions', () => {
  const payroll = frontend('app/(dashboard)/payroll/page.tsx');
  assert.match(payroll, /Buka rincian payroll sebelum mengambil keputusan final/);
  assert.match(payroll, /DialogContent className="max-h-\[88vh\] max-w-4xl overflow-y-auto"/);
  assert.match(payroll, /Setujui & Finalkan/);
  assert.match(payroll, /Konfirmasi Keputusan/);
  assert.doesNotMatch(payroll.slice(payroll.indexOf('function DirectorApprovals'), payroll.indexOf('function FinancePayroll')), /prompt\(|confirm\(/);
  assert.doesNotMatch(payroll, /\b(?:window\.)?(?:prompt|confirm)\(/);
  assert.match(payroll, /FinanceConfirmProvider/);
});

test('Phase 4 Commissioner and System Admin presentations do not expose business mutations', () => {
  const homes = frontend('components/phase4/RoleHomes.tsx');
  const system = frontend('app/(dashboard)/system/page.tsx');
  const activity = frontend('app/(dashboard)/activity/page.tsx');
  assert.match(homes, /KOMISARIS · READ-ONLY OVERVIEW/);
  assert.match(activity, /Tidak ada antrean tindakan untuk Komisaris/);
  assert.match(system, /tidak otomatis memberikan kewenangan proses Payroll/);
  assert.doesNotMatch(system, /\/payroll|approve|finalize|profile-photo/);
});

test('Phase 4 navigation uses real routes and conditionally floats Presensi from Employee configuration', () => {
  const navigation = frontend('lib/navigation.ts');
  const shell = frontend('components/AppShell.tsx');
  for (const route of ['/activity', '/profile', '/approvals', '/system']) assert.match(navigation, new RegExp(route));
  assert.doesNotMatch(navigation, /dashboard\?view/);
  assert.match(navigation, /\/attendance\?view=mine/);
  assert.match(shell, /attendanceEnabled=\{canAttend\(session\)\}/);
});

test('Phase 4 System Admin scope UI uses authoritative session and a Coordinator selector', () => {
  const users = frontend('app/(dashboard)/users/page.tsx');
  assert.match(users, /useSession\(\)/);
  assert.doesNotMatch(users, /getUser\(\)/);
  assert.match(users, /id="coordinator-scopes"/);
  assert.match(users, /user\.role === 'KOORDINATOR'/);
  assert.match(users, /TENAGA_BORONGAN/);
  assert.match(users, /TENAGA_ARSIPARIS/);
});

test('Phase 4 does not implement speculative payslip requests or optional executive attendance', () => {
  const files = [frontend('components/phase4/RoleHomes.tsx'), frontend('app/(dashboard)/payroll/page.tsx'), frontend('lib/navigation.ts')].join('\n');
  assert.doesNotMatch(files, /PayslipRequest|payslip-request|SLIP_REQUESTED|OPTIONAL_ATTENDANCE/);
  assert.match(frontend('lib/navigation.ts'), /session\.employee\.attendanceRequired/);
});
