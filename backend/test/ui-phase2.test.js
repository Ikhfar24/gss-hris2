const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const frontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');

test('Phase 2 KARYAWAN navigation has real Home, Pengajuan, Riwayat, and Profile destinations', () => {
  const navigation = frontend('lib/navigation.ts');
  for (const route of ['/dashboard', '/requests', '/attendance/history', '/profile']) assert.match(navigation, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(navigation, /session\.employee\.attendanceRequired/);
});

test('Phase 2 Employee Home uses authoritative session and existing self-scoped data', () => {
  const home = frontend('components/employee/EmployeeHome.tsx');
  assert.match(home, /useSession\(\)/);
  assert.match(home, /\/attendance\/me\/today/);
  assert.match(home, /\/employees\/me\/360/);
  assert.doesNotMatch(home, /getUser\(/);
  assert.match(home, /Aktivitas Terbaru/);
  assert.match(home, /slice\(0, 3\)/);
});

test('Phase 2 history is mobile-first and does not mount live geolocation', () => {
  const history = frontend('components/attendance/AttendanceHistoryView.tsx');
  const route = frontend('app/(dashboard)/attendance/history/page.tsx');
  assert.match(history, /\/attendance\/me\/history/);
  assert.match(history, /attendance-month/);
  assert.match(history, /\/attendance\/history\/\$\{row\.id\}/);
  assert.doesNotMatch(history, /watchPosition|getCurrentPosition|\/attendance\/me\/today/);
  assert.match(route, /AttendanceHistoryView/);
});

test('Phase 2 attendance detail preserves snapshot honesty and protected media', () => {
  const detail = frontend('components/attendance/AttendanceDetailView.tsx');
  const route = frontend('app/(dashboard)/attendance/history/[id]/page.tsx');
  assert.match(route, /`\/attendance\/\$\{id\}`/);
  assert.match(detail, /Lokasi historis tidak tersedia\./);
  assert.match(detail, /protectedMediaUrl/);
  assert.match(detail, /isMobile \? null : work/);
  assert.match(detail, /showGeofence=\{!isMobile\}/);
});

test('Phase 2 keeps fresh submission GPS and separates MOBILE radius presentation', () => {
  const attendance = frontend('app/(dashboard)/attendance/page.tsx');
  assert.match(attendance, /maximumAge: 0/);
  assert.match(attendance, /Mengambil GPS baru/);
  assert.match(attendance, /GPS diperoleh/);
  assert.match(attendance, /isMobile \? null : workPoint/);
  assert.match(attendance, /showGeofence=\{!isMobile\}/);
});

test('Phase 2 Profile remains self-view and does not expose Employee photo mutation', () => {
  const profile = frontend('app/(dashboard)/profile/page.tsx');
  const full = frontend('components/employee/EmployeeFullProfile.tsx');
  assert.match(profile, /\/profile\/full/);
  assert.match(profile, /Profil Lengkap/);
  assert.match(full, /Informasi kontrak rinci dikelola oleh HR/);
  assert.doesNotMatch(full, /profile-photo|uploadFile|Ganti Foto|Unggah Foto/);
});
