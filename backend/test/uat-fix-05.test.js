const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { EmployeesController } = require('../dist/employees/employees.controller');
const { EmployeesService } = require('../dist/employees/employees.service');
const { MediaService } = require('../dist/media/media.service');
const { EmployeeProfileChangeRequestsController } = require('../dist/employee-profile-change-requests/employee-profile-change-requests.controller');
const { saveImageBuffer } = require('../dist/common/utils/file-storage.util');

const hr = { userId: 'hr-1', email: 'hr@example.test', role: 'ADMIN_HR' };

function photoService(initialPhotoUrl = null) {
  let photoUrl = initialPhotoUrl;
  const audits = [];
  const prisma = {
    employee: { findUnique: async () => ({ id: 'employee-photo', photoUrl }) },
    $transaction: async (callback) => callback({
      employee: { update: async ({ data }) => { photoUrl = data.photoUrl; return { id: 'employee-photo', name: 'Photo User', photoUrl, user: null, placements: [], contracts: [] }; } },
      auditLog: { create: async ({ data }) => audits.push(data) },
    }),
  };
  return { service: new EmployeesService(prisma, {}), audits, current: () => photoUrl };
}

function removeStoredPhoto(url) {
  const match = /\/profile-photos\/([^/]+)\/([^/]+)$/.exec(url);
  if (match) fs.rmSync(path.join(process.cwd(), 'uploads', 'profile-photos', match[1], match[2]), { force: true });
}

test('UAT Fix Pack 05 exposes a proper Employee edit modal using the existing master endpoint', () => {
  const page = fs.readFileSync('../frontend/app/(dashboard)/employees/page.tsx', 'utf8');
  const editFunction = page.slice(page.indexOf('function editEmployee'), page.indexOf('async function lifecycle'));
  const modal = page.slice(page.indexOf('Edit Data Karyawan'), page.indexOf('{showForm &&', page.indexOf('Edit Data Karyawan')));
  assert.match(page, /Edit Data Karyawan/);
  assert.match(page, /apiFetch\(`\/employees\/\$\{editing\.id\}`/);
  assert.match(page, /setEditing\(null\); setEditForm\(null\)/);
  assert.doesNotMatch(editFunction, /window\.prompt|window\.confirm/);
  for (const field of ['Nama', 'NIP', 'NIK', 'Email', 'Telepon', 'Alamat', 'Jabatan']) assert.match(page, new RegExp(`label="${field}"|>${field}<`));
  for (const field of ['dailyRate', 'baseSalary', 'netPay', 'bankAccountNumber']) assert.doesNotMatch(modal, new RegExp(field));
});

test('UAT Fix Pack 05 changes user-facing Employee 360 terminology to Profil Lengkap', () => {
  const list = fs.readFileSync('../frontend/app/(dashboard)/employees/page.tsx', 'utf8');
  const profile = fs.readFileSync('../frontend/app/(dashboard)/employees/[id]/360/page.tsx', 'utf8');
  assert.match(list, />Profil Lengkap<\/Link>/);
  assert.match(profile, />Profil Lengkap<\/h1>/);
  assert.doesNotMatch(`${list}\n${profile}`, /Employee 360/);
});

test('UAT Fix Pack 05 allows only Admin HR to call the profile-photo mutation route', async () => {
  assert.deepEqual(Reflect.getMetadata('roles', EmployeesController.prototype.updateProfilePhoto), ['ADMIN_HR']);
  const { service } = photoService();
  for (const role of ['SYSTEM_ADMIN', 'KOORDINATOR', 'KEUANGAN', 'MARKETING', 'KARYAWAN']) {
    await assert.rejects(() => service.updateProfilePhoto('employee-photo', { mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff]) }, { userId: `${role}-1`, role }), /Hanya Admin HR/);
  }
});

test('UAT Fix Pack 05 uploads and replaces a valid protected profile photo with redacted audit metadata', async () => {
  const fixture = photoService();
  const urls = [];
  try {
    await fixture.service.updateProfilePhoto('employee-photo', { mimetype: 'image/jpeg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) }, hr);
    urls.push(fixture.current());
    await fixture.service.updateProfilePhoto('employee-photo', { mimetype: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }, hr);
    urls.push(fixture.current());
    assert.match(urls[0], /^\/api\/v1\/media\/profile-photos\/employee-photo\//);
    assert.notEqual(urls[0], urls[1]);
    assert.deepEqual(fixture.audits.map((audit) => audit.action), ['EMPLOYEE_PROFILE_PHOTO_UPLOAD', 'EMPLOYEE_PROFILE_PHOTO_REPLACE']);
    assert.doesNotMatch(JSON.stringify(fixture.audits), /profile-photos|\.jpg|\.png/);
  } finally {
    urls.forEach(removeStoredPhoto);
  }
});

test('UAT Fix Pack 05 rejects invalid, non-image, and oversized profile uploads', () => {
  assert.throws(() => saveImageBuffer(Buffer.from('%PDF-file'), 'application/pdf', 'profile-photos/employee-photo'), /File gambar tidak valid/);
  assert.throws(() => saveImageBuffer(Buffer.from('not-an-image'), 'image/jpeg', 'profile-photos/employee-photo'), /File gambar tidak valid/);
  assert.throws(() => saveImageBuffer(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/png', 'profile-photos/employee-photo'), /melebihi 5 MB/);
});

test('UAT Fix Pack 05 serves profile photos only after Employee reference and visibility checks', async () => {
  const approvedScopes = { assertEmployee: async () => undefined };
  const media = new MediaService({ employee: { findFirst: async () => ({ employmentType: 'TENAGA_BORONGAN' }) }, user: { findUnique: async () => ({ employeeId: null }) } }, approvedScopes);
  media.file = () => ({ authorized: true });
  assert.deepEqual(await media.openProfilePhoto('employee-1', 'safe.jpg', { userId: 'coordinator-1', role: 'KOORDINATOR' }), { authorized: true });

  const denied = new MediaService({ employee: { findFirst: async () => ({ employmentType: 'TENAGA_ARSIPARIS' }) }, user: { findUnique: async () => ({ employeeId: null }) } }, { assertEmployee: async () => { throw new Error('di luar CoordinatorScope'); } });
  denied.file = () => ({ authorized: false });
  await assert.rejects(() => denied.openProfilePhoto('employee-2', 'safe.jpg', { userId: 'coordinator-1', role: 'KOORDINATOR' }), /CoordinatorScope/);

  const stale = new MediaService({ employee: { findFirst: async () => null } }, approvedScopes);
  await assert.rejects(() => stale.openProfilePhoto('employee-1', 'old.jpg', hr), /Foto profil tidak ditemukan/);
});

test('UAT Fix Pack 05 includes photo metadata in an already-authorized Coordinator profile projection', () => {
  const service = new EmployeesService({}, {});
  const result = service.present({ id: 'employee-1', name: 'Scoped', employmentType: 'TENAGA_BORONGAN', photoUrl: '/api/v1/media/profile-photos/employee-1/photo.jpg', placements: [] }, { userId: 'coordinator-1', role: 'KOORDINATOR' });
  assert.equal(result.photoUrl, '/api/v1/media/profile-photos/employee-1/photo.jpg');
  assert.equal(result.bankAccountNumber, undefined);
});

test('UAT Fix Pack 05 keeps placeholder, deterministic HR controls, and Profile Change Request policy', () => {
  const profile = fs.readFileSync('../frontend/app/(dashboard)/employees/[id]/360/page.tsx', 'utf8');
  assert.match(profile, /Foto profil belum tersedia/);
  assert.match(profile, /role === 'ADMIN_HR'/);
  assert.match(profile, /setRole\(getUser\(\)\?\.role \?\? null\)/);
  assert.deepEqual(Reflect.getMetadata('roles', EmployeeProfileChangeRequestsController.prototype.create), ['KARYAWAN']);
});

test('UAT Fix Pack 05 preserves attendance and leave protected media routes', () => {
  const controller = fs.readFileSync('src/media/media.controller.ts', 'utf8');
  assert.match(controller, /@Get\('selfies\/:employeeId\/:filename'\)/);
  assert.match(controller, /@Get\('leave-documents\/:employeeId\/:filename'\)/);
});
