const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { APP_GUARD } = require('@nestjs/core');
const { ThrottlerGuard } = require('@nestjs/throttler');
const JSZip = require('jszip');
const { HEADERS_METADATA, MODULE_METADATA } = require('@nestjs/common/constants');
const { AppModule } = require('../dist/app.module');
const { MediaController } = require('../dist/media/media.controller');
const { PayrollService } = require('../dist/payroll/payroll.service');
const { AuthService } = require('../dist/auth/auth.service');
const { PlacementRequestsService } = require('../dist/placement-requests/placement-requests.service');
const { parseImportXlsx } = require('../dist/common/utils/xlsx-import.util');
const { isTrustedBrowserOrigin, isUnsafeMethod, trustedOrigins } = require('../dist/common/security/trusted-origin');

test('global throttling is active and sensitive routes retain tighter limits', () => {
  const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule);
  assert.ok(providers.some((provider) => provider.provide === APP_GUARD && provider.useClass === ThrottlerGuard));
  const auth = fs.readFileSync('src/auth/auth.controller.ts', 'utf8');
  assert.match(auth, /@Throttle\(\{ default: \{ limit: 5, ttl: 60000 \} \}\)/);
});

test('trusted-origin policy rejects cross-site browser mutations without blocking non-browser clients', () => {
  const allowed = trustedOrigins('https://hr.example.test,http://localhost:3000', 'production');
  assert.equal(isUnsafeMethod('PATCH'), true);
  assert.equal(isUnsafeMethod('GET'), false);
  assert.equal(isTrustedBrowserOrigin('https://hr.example.test', allowed), true);
  assert.equal(isTrustedBrowserOrigin('https://evil.example.test', allowed), false);
  assert.equal(isTrustedBrowserOrigin('null', allowed), false);
  assert.equal(isTrustedBrowserOrigin(undefined, allowed), true);
  assert.throws(() => trustedOrigins(undefined, 'production'), /CORS_ORIGIN/);
  assert.throws(() => trustedOrigins('https://example.test/path', 'production'), /Origin tidak valid/);
});

test('protected media disables caching and forces leave evidence downloads', () => {
  const selfie = Reflect.getMetadata(HEADERS_METADATA, MediaController.prototype.selfie);
  const leave = Reflect.getMetadata(HEADERS_METADATA, MediaController.prototype.leaveDocument);
  const profile = Reflect.getMetadata(HEADERS_METADATA, MediaController.prototype.profilePhoto);
  for (const headers of [selfie, leave, profile]) {
    assert.ok(headers.some((header) => header.name === 'Cache-Control' && /no-store/.test(header.value)));
    assert.ok(headers.some((header) => header.name === 'Pragma' && header.value === 'no-cache'));
  }
  assert.ok(leave.some((header) => header.name === 'Content-Disposition' && header.value === 'attachment'));
});

test('production seed is explicitly gated and never resets existing privileged credentials', () => {
  const seed = fs.readFileSync('prisma/seed.ts', 'utf8');
  assert.match(seed, /NODE_ENV === 'production'/);
  assert.match(seed, /ALLOW_INSECURE_DEVELOPMENT_SEED !== 'true'/);
  assert.match(seed, /update: \{\}/);
  assert.doesNotMatch(seed, /update: \{[^}]*passwordHash[^}]*isActive: true/);
});

test('frontend security policy removes temporary trust and browser-readable session identity', () => {
  const nextConfig = fs.readFileSync('../frontend/next.config.js', 'utf8');
  const auth = fs.readFileSync('../frontend/lib/auth.ts', 'utf8');
  const login = fs.readFileSync('../frontend/app/login/page.tsx', 'utf8');
  assert.doesNotMatch(nextConfig, /ngrok-free\.dev/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /frame-ancestors 'none'/);
  assert.doesNotMatch(auth, /function saveSession|JSON\.stringify\(user\)/);
  assert.match(auth, /papaiz_attendance_queue:/);
  assert.doesNotMatch(login, /saveSession/);
});

test('payroll line-item mutation rechecks and locks DRAFT status inside its transaction', async () => {
  let lineItemCreated = false;
  const prisma = {
    payrollSlip: { findUnique: async () => ({ id: 'slip-1', payrollRunId: 'run-1', payrollRun: { id: 'run-1', status: 'DRAFT' } }) },
    $transaction: async (callback) => callback({
      payrollRun: { updateMany: async () => ({ count: 0 }) },
      payrollLineItem: { create: async () => { lineItemCreated = true; } },
    }),
  };
  const service = new PayrollService(prisma, { record: async () => undefined });
  await assert.rejects(
    () => service.addLineItem('slip-1', { type: 'EARNING', label: 'Adjustment', amount: 1000, reason: 'Approved adjustment' }, { userId: 'finance-1', role: 'KEUANGAN' }),
    /DRAFT/,
  );
  assert.equal(lineItemCreated, false);
});

test('placement approval claims status and finalizes placement in one serializable transaction', async () => {
  const calls = [];
  const tx = {
    placementRequest: { updateMany: async (query) => { calls.push(['claim', query]); return { count: 1 }; } },
    placement: {
      findMany: async (query) => query.where.status === 'SCHEDULED' ? [] : [],
      updateMany: async (query) => calls.push(['end', query]),
      create: async (query) => calls.push(['create', query]),
    },
  };
  const prisma = {
    $transaction: async (work, options) => { calls.push(['transaction', options]); return work(tx); },
  };
  const request = {
    id: 'request-1', employeeId: 'employee-1', destinationLocationId: 'location-2',
    startDate: new Date('2026-09-01'), endDate: null, status: 'PENDING_DIRECTOR', type: 'MUTATION',
  };
  const service = new PlacementRequestsService(prisma, { record: async () => undefined }, {});
  service.findOne = async () => request;
  await service.directorApprove('request-1', { approve: true }, { userId: 'director-1', role: 'DIREKTUR' });
  assert.equal(calls[0][1].isolationLevel, 'Serializable');
  assert.deepEqual(calls[1][1].where, { id: 'request-1', status: 'PENDING_DIRECTOR' });
  assert.ok(calls.some(([name]) => name === 'create'));
});

test('logout rotates the server-side session version and audits atomically', async () => {
  const writes = [];
  const prisma = {
    $transaction: async (callback) => callback({
      user: { update: async (query) => { writes.push(query); return { role: 'KARYAWAN', sessionVersion: 8 }; } },
      auditLog: { create: async (query) => writes.push(query) },
      refreshSession: { updateMany: async () => ({ count: 0 }) },
    }),
  };
  await new AuthService(prisma, {}, {}).logout('user-1');
  assert.deepEqual(writes[0].data, { sessionVersion: { increment: 1 } });
  assert.equal(writes[1].data.action, 'AUTH_LOGOUT');
  assert.deepEqual(writes[1].data.newValue, { sessionVersion: 8 });
});

test('expired temporary credentials cannot authenticate', async () => {
  const passwordHash = require('bcrypt').hashSync('Temporary-password-123!', 10);
  const service = new AuthService({
    user: { findFirst: async () => ({ id: 'user-1', email: 'user@example.test', role: 'KARYAWAN', isActive: true, mustChangePassword: true, sessionVersion: 1, passwordHash, temporaryCredential: { createdAt: new Date() } }) },
  }, {}, {}, { isExpired: () => true });
  assert.equal(await service.validateUser('user@example.test', 'Temporary-password-123!'), null);
});

test('successful authentication never returns temporary credential material', async () => {
  const passwordHash = require('bcrypt').hashSync('Temporary-password-123!', 10);
  const service = new AuthService({
    user: { findFirst: async () => ({ id: 'user-1', email: 'user@example.test', role: 'KARYAWAN', isActive: true, mustChangePassword: true, sessionVersion: 1, passwordHash, temporaryCredential: { encryptedPassword: 'secret', createdAt: new Date() } }) },
  }, {}, {}, { isExpired: () => false });
  const user = await service.validateUser('user@example.test', 'Temporary-password-123!');
  assert.equal(user.passwordHash, undefined);
  assert.equal(user.temporaryCredential, undefined);
});

test('XLSX parser rejects decompression bombs and executable embedded content before parsing', async () => {
  const bomb = new JSZip();
  bomb.file('[Content_Types].xml', '<Types/>');
  bomb.file('xl/workbook.xml', '<workbook/>');
  bomb.file('xl/sharedStrings.xml', 'A'.repeat(11 * 1024 * 1024));
  const bombBuffer = await bomb.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(
    () => parseImportXlsx({ buffer: bombBuffer, originalname: 'bomb.xlsx' }, [{ key: 'name', type: 'string' }]),
    /terlalu kompleks|ukuran ekstraknya/,
  );

  const macro = new JSZip();
  macro.file('[Content_Types].xml', '<Types/>');
  macro.file('xl/workbook.xml', '<workbook/>');
  macro.file('xl/vbaProject.bin', Buffer.from([0]));
  const macroBuffer = await macro.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => parseImportXlsx({ buffer: macroBuffer, originalname: 'macro.xlsx' }, [{ key: 'name', type: 'string' }]),
    /macro atau objek tertanam/,
  );
});
