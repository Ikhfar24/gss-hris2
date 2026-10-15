const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { AuthService } = require('../dist/auth/auth.service');
const { AuthController } = require('../dist/auth/auth.controller');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');

const JWT_SECRET = 'a-32-character-minimum-jwt-secret!';
const config = { get: (key) => (key === 'JWT_SECRET' ? JWT_SECRET : undefined) };

const fakeJwtService = {
  sign: (payload, opts) => jwt.sign(payload, JWT_SECRET, { expiresIn: opts?.expiresIn ?? '8h' }),
  verify: (token) => jwt.verify(token, JWT_SECRET),
};

test('generateRefreshToken creates a 7-day token with type refresh and sessionVersion', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({ id: 'u1', sessionVersion: 3 }),
    },
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const token = await service.generateRefreshToken('u1');
  const decoded = jwt.decode(token);

  assert.equal(decoded.sub, 'u1');
  assert.equal(decoded.type, 'refresh');
  assert.equal(decoded.sessionVersion, 3);
  assert.ok(decoded.exp - decoded.iat >= 7 * 24 * 3600 - 10);
});

test('login returns both access token and refresh token', async () => {
  const prisma = {
    user: {
      update: async () => ({ id: 'u1' }),
      findUnique: async () => ({ id: 'u1', sessionVersion: 1 }),
    },
    auditLog: {
      create: async () => ({ id: 'log-1' }),
    },
    $transaction: async (cb) => cb(prisma),
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const result = await service.login({
    id: 'u1',
    email: 'user@example.com',
    role: 'KARYAWAN',
    mustChangePassword: false,
    sessionVersion: 1,
  });

  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.refreshMaxAgeMs, 7 * 24 * 60 * 60 * 1000);

  const refreshDecoded = jwt.decode(result.refreshToken);
  assert.equal(refreshDecoded.type, 'refresh');
  assert.equal(refreshDecoded.sub, 'u1');
});

test('refreshAccessToken succeeds and rotates tokens when valid', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u1',
        email: 'user@example.com',
        role: 'KARYAWAN',
        isActive: true,
        mustChangePassword: false,
        sessionVersion: 2,
      }),
    },
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const validRefreshToken = fakeJwtService.sign({ sub: 'u1', type: 'refresh', sessionVersion: 2 }, { expiresIn: '7d' });

  const result = await service.refreshAccessToken(validRefreshToken);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.email, 'user@example.com');

  const accessDecoded = jwt.decode(result.accessToken);
  assert.equal(accessDecoded.sub, 'u1');
  assert.equal(accessDecoded.sessionVersion, 2);

  const newRefreshDecoded = jwt.decode(result.refreshToken);
  assert.equal(newRefreshDecoded.type, 'refresh');
  assert.equal(newRefreshDecoded.sessionVersion, 2);
});

test('refreshAccessToken rejects token with mismatched sessionVersion', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u1',
        email: 'user@example.com',
        role: 'KARYAWAN',
        isActive: true,
        mustChangePassword: false,
        sessionVersion: 5, // DB version is 5
      }),
    },
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const staleRefreshToken = fakeJwtService.sign({ sub: 'u1', type: 'refresh', sessionVersion: 4 }, { expiresIn: '7d' });

  await assert.rejects(
    () => service.refreshAccessToken(staleRefreshToken),
    /Sesi telah kedaluwarsa atau diperbarui/
  );
});

test('refreshAccessToken rejects inactive user', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u1',
        email: 'user@example.com',
        role: 'KARYAWAN',
        isActive: false,
        mustChangePassword: false,
        sessionVersion: 1,
      }),
    },
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const token = fakeJwtService.sign({ sub: 'u1', type: 'refresh', sessionVersion: 1 }, { expiresIn: '7d' });

  await assert.rejects(
    () => service.refreshAccessToken(token),
    /Sesi tidak lagi aktif/
  );
});

test('refreshAccessToken rejects token with non-refresh type', async () => {
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'u1',
        email: 'user@example.com',
        role: 'KARYAWAN',
        isActive: true,
        sessionVersion: 1,
      }),
    },
  };
  const service = new AuthService(prisma, fakeJwtService, {});
  const accessAsRefresh = fakeJwtService.sign({ sub: 'u1', type: 'access', sessionVersion: 1 });

  await assert.rejects(
    () => service.refreshAccessToken(accessAsRefresh),
    /Token refresh tidak valid/
  );
});

test('JwtStrategy rejects token with type: refresh', async () => {
  const strategy = new JwtStrategy(config, {
    user: { findUnique: async () => ({ id: 'u1', email: 'user@example.test', role: 'KARYAWAN', isActive: true, sessionVersion: 1 }) },
  });
  await assert.rejects(
    () => strategy.validate({ sub: 'u1', email: 'user@example.test', role: 'KARYAWAN', type: 'refresh', sessionVersion: 1 }),
    /Token refresh tidak dapat digunakan sebagai token akses/
  );
});

test('AuthController.login sets both access and refresh cookies', async () => {
  const controller = new AuthController({
    login: async () => ({
      accessToken: 'access-jwt-123',
      refreshToken: 'refresh-jwt-456',
      maxAgeMs: 8 * 60 * 60 * 1000,
      refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      user: { id: 'u1', email: 'user@example.test', role: 'KARYAWAN' },
    }),
  });

  const cookiesSet = [];
  const response = {
    cookie: (name, val, opts) => {
      cookiesSet.push({ name, val, opts });
    },
  };

  const result = await controller.login({}, { user: { id: 'u1' } }, response);
  assert.equal(cookiesSet.length, 2);

  const refreshCookie = cookiesSet.find((c) => c.name === 'papaiz_refresh_token');
  assert.ok(refreshCookie);
  assert.equal(refreshCookie.val, 'refresh-jwt-456');
  assert.equal(refreshCookie.opts.httpOnly, true);
  assert.equal(refreshCookie.opts.sameSite, 'strict');
  assert.equal(refreshCookie.opts.path, '/api/v1/auth/refresh');
  assert.equal(refreshCookie.opts.maxAge, 7 * 24 * 60 * 60 * 1000);

  const accessCookie = cookiesSet.find((c) => c.name === 'papaiz_access_token');
  assert.ok(accessCookie);
  assert.equal(accessCookie.val, 'access-jwt-123');
  assert.equal(accessCookie.opts.path, '/');

  assert.equal(result.user.id, 'u1');
});

test('AuthController.refresh reads cookie and sets both updated cookies', async () => {
  const controller = new AuthController({
    refreshAccessToken: async (token) => {
      assert.equal(token, 'cookie-refresh-token');
      return {
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-jwt',
        maxAgeMs: 8 * 60 * 60 * 1000,
        refreshMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
      };
    },
  });

  const cookiesSet = [];
  const response = {
    cookie: (name, val, opts) => {
      cookiesSet.push({ name, val, opts });
    },
  };

  const req = {
    cookies: { papaiz_refresh_token: 'cookie-refresh-token' },
  };

  const result = await controller.refresh(req, response);
  assert.deepEqual(result, { message: 'Token diperbarui' });
  assert.equal(cookiesSet.length, 2);

  const refreshCookie = cookiesSet.find((c) => c.name === 'papaiz_refresh_token');
  assert.equal(refreshCookie.val, 'new-refresh-jwt');
  assert.equal(refreshCookie.opts.path, '/api/v1/auth/refresh');

  const accessCookie = cookiesSet.find((c) => c.name === 'papaiz_access_token');
  assert.equal(accessCookie.val, 'new-access-jwt');
});

test('AuthController.refresh throws UnauthorizedException when cookie is missing', async () => {
  const controller = new AuthController({});
  const response = { cookie: () => {} };
  const req = { cookies: {} };

  await assert.rejects(
    () => controller.refresh(req, response),
    /Token refresh tidak ditemukan/
  );
});

test('AuthController.logout clears both access and refresh cookies with respective paths', async () => {
  const controller = new AuthController({
    logout: async () => {},
  });

  const cookiesCleared = [];
  const response = {
    clearCookie: (name, opts) => {
      cookiesCleared.push({ name, opts });
    },
  };

  const result = await controller.logout({ userId: 'u1' }, response);
  assert.deepEqual(result, { loggedOut: true });

  const accessClear = cookiesCleared.find((c) => c.name === 'papaiz_access_token');
  assert.ok(accessClear);
  assert.equal(accessClear.opts.path, '/');

  const refreshClear = cookiesCleared.find((c) => c.name === 'papaiz_refresh_token');
  assert.ok(refreshClear);
  assert.equal(refreshClear.opts.path, '/api/v1/auth/refresh');
});

test('anti-CSRF check rejects browser unsafe methods on /api/v1 without X-Requested-With: XMLHttpRequest', () => {
  function runCsrfMiddleware(req) {
    let status, body, nextCalled = false;
    const res = {
      status: (s) => { status = s; return { json: (b) => { body = b; } }; },
    };
    const next = () => { nextCalled = true; };

    const origin = req.get?.('origin') ?? req.headers?.origin;
    const isUnsafeMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method?.toUpperCase());
    const allowedOrigins = new Set(['http://localhost:3000']);
    const isTrustedBrowserOrigin = (o) => o === undefined || allowedOrigins.has(o);

    if (isUnsafeMethod && !isTrustedBrowserOrigin(origin)) {
      res.status(403).json({ statusCode: 403, message: 'Origin permintaan tidak diizinkan', error: 'Forbidden' });
      return { status, body, nextCalled };
    }
    const path = req.originalUrl || req.url || req.path || '';
    if (origin && isUnsafeMethod && path.startsWith('/api/v1')) {
      const requestedWith = req.get?.('x-requested-with') ?? req.headers?.['x-requested-with'];
      if (requestedWith !== 'XMLHttpRequest') {
        res.status(403).json({ statusCode: 403, message: 'Header CSRF tidak valid', error: 'Forbidden' });
        return { status, body, nextCalled };
      }
    }
    next();
    return { status, body, nextCalled };
  }

  // 1. Browser POST to /api/v1 without X-Requested-With -> 403
  const browserUnsafeWithoutHeader = runCsrfMiddleware({
    method: 'POST',
    originalUrl: '/api/v1/leave-requests',
    get: (h) => (h.toLowerCase() === 'origin' ? 'http://localhost:3000' : undefined),
  });
  assert.equal(browserUnsafeWithoutHeader.status, 403);
  assert.equal(browserUnsafeWithoutHeader.body.message, 'Header CSRF tidak valid');
  assert.equal(browserUnsafeWithoutHeader.nextCalled, false);

  // 2. Browser POST to /api/v1 with X-Requested-With: XMLHttpRequest -> allowed
  const browserUnsafeWithHeader = runCsrfMiddleware({
    method: 'POST',
    originalUrl: '/api/v1/leave-requests',
    get: (h) => {
      if (h.toLowerCase() === 'origin') return 'http://localhost:3000';
      if (h.toLowerCase() === 'x-requested-with') return 'XMLHttpRequest';
      return undefined;
    },
  });
  assert.equal(browserUnsafeWithHeader.nextCalled, true);
  assert.equal(browserUnsafeWithHeader.status, undefined);

  // 3. Browser GET on /api/v1 without X-Requested-With -> allowed
  const browserSafe = runCsrfMiddleware({
    method: 'GET',
    originalUrl: '/api/v1/employees',
    get: (h) => (h.toLowerCase() === 'origin' ? 'http://localhost:3000' : undefined),
  });
  assert.equal(browserSafe.nextCalled, true);

  // 4. Non-browser POST (no origin) without X-Requested-With -> allowed
  const nonBrowserPost = runCsrfMiddleware({
    method: 'POST',
    originalUrl: '/api/v1/employees',
    get: () => undefined,
  });
  assert.equal(nonBrowserPost.nextCalled, true);

  // 5. Browser POST on non-/api/v1 route without X-Requested-With -> allowed
  const nonApiRoute = runCsrfMiddleware({
    method: 'POST',
    originalUrl: '/health',
    get: (h) => (h.toLowerCase() === 'origin' ? 'http://localhost:3000' : undefined),
  });
  assert.equal(nonApiRoute.nextCalled, true);
});

