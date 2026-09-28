const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const frontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');
const { AuthService } = require('../dist/auth/auth.service');
const { DashboardService } = require('../dist/dashboard/dashboard.service');

test('Phase 3 session exposes active CoordinatorScope types from the backend', async () => {
  let scopeQuery;
  const service = new AuthService({
    user: { findUnique: async () => ({ id: 'coord-1', email: 'coord@test', role: 'KOORDINATOR', isActive: true, employee: null }) },
    coordinatorScope: { findMany: async (query) => { scopeQuery = query; return [{ employmentType: 'TENAGA_ARSIPARIS' }]; } },
  }, {}, {});
  const result = await service.me({ userId: 'coord-1', email: 'coord@test', role: 'KOORDINATOR' });
  assert.deepEqual(result.coordinatorScopeTypes, ['TENAGA_ARSIPARIS']);
  assert.deepEqual(scopeQuery.where, { coordinatorUserId: 'coord-1', active: true });
});

test('Phase 3 dashboard employment filter remains intersected with CoordinatorScope', async () => {
  const queries = [];
  const count = async (query) => { queries.push(query); return 0; };
  const service = new DashboardService({ employee: { count }, attendance: { count }, leaveRequest: { count }, placementRequest: { count }, placement: { count } }, { employeeWhere: async () => ({ employmentType: { in: ['TENAGA_ARSIPARIS'] } }) });
  await service.summary({ userId: 'coord-1', role: 'KOORDINATOR' }, 'TENAGA_BORONGAN');
  const scopes = queries.map((query) => query.where.employee ?? query.where).filter((where) => where.AND);
  assert.ok(scopes.length > 0);
  for (const scope of scopes) assert.deepEqual(scope.AND, [{ employmentType: { in: ['TENAGA_ARSIPARIS'] } }, { employmentType: 'TENAGA_BORONGAN' }]);
});

test('Phase 3 dashboards keep personal attendance separate from team and workforce contexts', () => {
  const page = frontend('app/(dashboard)/dashboard/page.tsx');
  const home = frontend('components/management/ManagementHome.tsx');
  assert.match(page, /ManagementHome role=\{session\.role\}/);
  assert.match(home, /PRIBADI/);
  assert.match(home, /TIM/);
  assert.match(home, /Workforce/);
  assert.match(home, /\/attendance\/me\/today/);
  assert.match(home, /employmentType=\$\{type\}/);
  assert.doesNotMatch(home, /coordinatorId/);
});

test('Phase 3 team cards use backend-scoped employee and attendance endpoints', () => {
  const employees = frontend('app/(dashboard)/employees/page.tsx');
  assert.match(employees, /session\.coordinatorScopeTypes/);
  assert.match(employees, /apiFetch<EmployeeResponse>\(`\/employees\?\$\{params\}`\)/);
  assert.match(employees, /apiFetch<.*>\(["']\/attendance\/monitoring["']\)/s);
  assert.match(employees, /Tim Saya/);
  assert.doesNotMatch(employees, /coordinatorId.*filter/);
});

test('Phase 3 Coordinator detail remains read-only and explicitly redacted', () => {
  const profile = frontend('components/management/ManagementEmployeeProfile.tsx');
  assert.match(profile, /CoordinatorEmployeeProfile/);
  assert.match(profile, /Informasi bank, BPJS, gaji, tarif harian/);
  assert.match(profile, /Koordinator tidak memiliki tindakan edit/);
});

test('Phase 3 ADMIN_HR actions use dialogs and preserve exclusive photo mutation', () => {
  const profile = frontend('components/management/ManagementEmployeeProfile.tsx');
  const route = frontend('app/(dashboard)/employees/[id]/360/page.tsx');
  assert.match(route, /session\.role === 'ADMIN_HR'.*AdminEmployeeProfile/s);
  assert.match(profile, /DialogContent/);
  assert.match(profile, /\/profile-photo/);
  assert.match(profile, /Hapus Aman/);
  assert.match(profile, /attendanceMode/);
  assert.doesNotMatch(profile, /SYSTEM_ADMIN/);
});

test('Phase 3 attendance review uses accessible detail and decision dialogs', () => {
  const attendance = frontend('app/(dashboard)/attendance/page.tsx');
  const monitor = frontend('components/attendance/PeopleAttendanceMonitoring.tsx');
  assert.match(attendance, /<PeopleAttendanceMonitoring\s+role=\{role\}\s+context=\{authorityView\}\s*\/>/);
  assert.match(monitor, /<AttendanceDetailView\s+attendance=\{detail\}\s*\/>/);
  assert.match(monitor, /async function review\(decision: 'APPROVED' \| 'REJECTED'\)/);
  assert.match(monitor, /apiFetch\(`\/attendance\/\$\{detail\.id\}\/review`,\s*\{\s*method: 'POST',\s*body: \{\s*decision,\s*note:/s);
  assert.doesNotMatch(monitor, /window\.prompt/);
  assert.match(monitor, /searchParams\.get\('validationStatus'\) === 'NEEDS_REVIEW' \? 'NEEDS_REVIEW' : 'ALL'/);
});

test('Phase 3 keeps Company Settings restricted in centralized navigation', () => {
  const navigation = frontend('lib/navigation.ts');
  assert.match(navigation, /Pengaturan Perusahaan.*roles: \['SYSTEM_ADMIN'\]/);
  assert.match(navigation, /KOORDINATOR:.*'\/activity'.*'\/profile'/);
  assert.match(navigation, /ADMIN_HR:.*'\/activity'.*'\/profile'/);
});
