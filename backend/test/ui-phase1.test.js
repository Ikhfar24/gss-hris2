const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

function frontend(path) {
  return fs.readFileSync(`../frontend/${path}`, 'utf8');
}

test('UI Phase 1 defines the approved visual tokens and a single icon language', () => {
  const globals = frontend('app/globals.css');
  const tailwind = frontend('tailwind.config.ts');
  const pkg = JSON.parse(frontend('package.json'));
  assert.match(globals, /--brand-color: #0f3151/);
  assert.match(globals, /--grey: #f0f0f0/);
  assert.match(tailwind, /brand-rgb/);
  assert.ok(pkg.dependencies['lucide-react']);
  assert.equal(pkg.dependencies.next, '15.5.24');
  assert.equal(pkg.dependencies.react, '^18.3.1');
});

test('UI Phase 1 shell uses authoritative session bootstrap and deterministic fallback', () => {
  const layout = frontend('app/(dashboard)/layout.tsx');
  const provider = frontend('components/providers/SessionProvider.tsx');
  const shell = frontend('components/AppShell.tsx');
  assert.match(layout, /SessionProvider fallback=\{<AppShellSkeleton \/>\}/);
  assert.match(provider, /apiFetch<unknown>\('\/auth\/me'\)/);
  assert.doesNotMatch(shell, /getUser\(/);
  assert.match(shell, /id="main-content"/);
  assert.match(shell, /Lewati ke konten utama/);
});

test('UI Phase 1 navigation is centralized, role-aware, and preserves attendance eligibility', () => {
  const navigation = frontend('lib/navigation.ts');
  const shell = frontend('components/AppShell.tsx');
  assert.match(navigation, /session\.employee\.attendanceRequired/);
  assert.match(navigation, /session\.employee\.status === 'ACTIVE'/);
  assert.match(navigation, /activePlacementName/);
  assert.match(shell, /Fingerprint/);
  assert.match(shell, /rounded-2xl/);
  assert.match(shell, /Buka semua modul/);
  assert.match(navigation, /requiresAttendance: true/);
  assert.match(navigation, /session\.employee\.attendanceRequired/);
  for (const label of ['Beranda', 'Pengajuan', 'Riwayat', 'Profil', 'Tim', 'Karyawan', 'Payroll', 'Aktivitas']) assert.match(navigation, new RegExp(`'${label}'`));
});

test('UI Phase 1 branding uses only the public projection and supports runtime refresh', () => {
  const provider = frontend('components/providers/BrandingProvider.tsx');
  const settings = frontend('app/(dashboard)/settings/page.tsx');
  assert.match(provider, /apiFetch<unknown>\('\/branding'\)/);
  assert.match(provider, /--brand-rgb/);
  assert.match(provider, />= 4\.5 \? value : fallback\.primaryColor/);
  assert.match(provider, /branding-updated/);
  assert.match(provider, /\^\\\/\(\?!\\\/\)/);
  assert.match(settings, /session\.role !== 'SYSTEM_ADMIN'/);
  assert.match(settings, /Path Favicon/);
});

test('UI Phase 1 AttendanceMode UI preserves geofence and requires GPS for mobile', () => {
  const attendance = frontend('app/(dashboard)/attendance/page.tsx');
  const map = frontend('components/AttendanceMap.tsx');
  const employees = frontend('app/(dashboard)/employees/page.tsx');
  assert.match(attendance, /attendanceMode === 'MOBILE'/);
  assert.match(attendance, /Mode MOBILE mewajibkan GPS aktif/);
  assert.match(attendance, /maximumAge: 0/);
  assert.match(attendance, /showGeofence=\{!isMobile\}/);
  assert.match(map, /showGeofence \? workPoint : null/);
  assert.match(employees, /role === ["']ADMIN_HR["'].*attendanceMode/s);
  assert.doesNotMatch(employees, /role === ["']SYSTEM_ADMIN["'].*attendanceMode/s);
});
