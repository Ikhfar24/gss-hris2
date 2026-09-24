const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validate } = require('class-validator');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');
const { Role } = require('../dist/common/enums/role.enum');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { LifecycleDto } = require('../dist/users/dto/lifecycle.dto');
const { UsersController } = require('../dist/users/users.controller');
const { UsersService } = require('../dist/users/users.service');

const systemAdmin = { userId: 'system-admin-1', email: 'system@example.test', role: Role.SYSTEM_ADMIN };

function target(overrides = {}) {
  return {
    id: 'target-1',
    employeeId: 'employee-1',
    name: 'Target User',
    email: 'target@example.test',
    role: Role.KARYAWAN,
    isActive: true,
    lastLoginAt: new Date('2026-09-20T08:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function forceDeletePrisma(user) {
  const calls = [];
  let coordinatorScopeBlocked = true;
  const tx = {
    user: {
      findUnique: async () => user,
      delete: async ({ where }) => {
        assert.equal(coordinatorScopeBlocked, false, 'blocking coordinator scopes must be removed first');
        calls.push(['user.delete', where]);
      },
    },
    coordinatorScope: {
      deleteMany: async (args) => {
        coordinatorScopeBlocked = false;
        calls.push(['coordinatorScope.deleteMany', args]);
        return { count: 3 };
      },
    },
    employee: {
      updateMany: async (args) => {
        calls.push(['employee.updateMany', args]);
        return { count: 4 };
      },
    },
    userTemporaryCredential: {
      deleteMany: async (args) => {
        calls.push(['userTemporaryCredential.deleteMany', args]);
        return { count: 1 };
      },
    },
    auditLog: {
      create: async ({ data }) => {
        calls.push(['auditLog.create', data]);
        return data;
      },
    },
  };
  return {
    calls,
    prisma: { $transaction: async (callback) => callback(tx) },
  };
}

test('force-delete route and service are restricted to SYSTEM_ADMIN', async () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, UsersController.prototype.forceDelete), [Role.SYSTEM_ADMIN]);
  const service = new UsersService({ $transaction: async () => assert.fail('unauthorized actor entered transaction') }, {});
  await assert.rejects(
    () => service.forceDelete('target-1', 'Administrative removal', { userId: 'hr-1', email: 'hr@example.test', role: Role.ADMIN_HR }),
    /Hanya System Admin/,
  );
});

test('force delete accepts an active user with no history and removes every blocking live relation', async () => {
  const fixture = forceDeletePrisma(target());
  const service = new UsersService(fixture.prisma, {});
  assert.deepEqual(await service.forceDelete('target-1', 'Account no longer required', systemAdmin), { deleted: true });
  assert.deepEqual(fixture.calls.map(([operation]) => operation), [
    'coordinatorScope.deleteMany',
    'employee.updateMany',
    'userTemporaryCredential.deleteMany',
    'auditLog.create',
    'user.delete',
  ]);
});

test('force delete accepts an inactive SYSTEM_ADMIN with extensive history and preserves an identity audit snapshot', async () => {
  const fixture = forceDeletePrisma(target({ isActive: false, role: Role.SYSTEM_ADMIN }));
  const service = new UsersService(fixture.prisma, {});
  await service.forceDelete('target-1', 'Remove historical account access', systemAdmin);

  const audit = fixture.calls.find(([operation]) => operation === 'auditLog.create')[1];
  assert.equal(audit.action, 'USER_FORCE_DELETE');
  assert.equal(audit.actorId, systemAdmin.userId);
  assert.equal(audit.entityId, 'target-1');
  assert.equal(audit.oldValue.email, 'target@example.test');
  assert.equal(audit.oldValue.isActive, false);
  assert.equal(audit.reason, 'Remove historical account access');
  assert.equal(fixture.calls.some(([operation]) => operation.includes('attendance') || operation.includes('payroll')), false);
});

test('force delete blocks self-deletion and requires a reason before opening a transaction', async () => {
  const service = new UsersService({ $transaction: async () => assert.fail('invalid request entered transaction') }, {});
  await assert.rejects(() => service.forceDelete(systemAdmin.userId, 'Self removal', systemAdmin), /akun sendiri/);
  await assert.rejects(() => service.forceDelete('target-1', '   ', systemAdmin), /Alasan wajib/);

  const invalidDto = Object.assign(new LifecycleDto(), { reason: 'no' });
  assert.ok((await validate(invalidDto)).some((error) => error.property === 'reason'));
});

test('a physically deleted user cannot log in or continue an existing JWT session', async () => {
  const prisma = { user: { findFirst: async () => null, findUnique: async () => null } };
  const auth = new AuthService(prisma, {}, {});
  assert.equal(await auth.validateUser('target@example.test', 'Password123!'), null);

  const strategy = Object.create(JwtStrategy.prototype);
  strategy.prisma = prisma;
  await assert.rejects(
    () => strategy.validate({ sub: 'target-1', email: 'target@example.test', role: Role.KARYAWAN, sessionVersion: 0 }),
    /Sesi tidak lagi aktif/,
  );
});

test('User Management exposes force delete only for SYSTEM_ADMIN and removes the row before refresh', () => {
  const page = fs.readFileSync('../frontend/app/(dashboard)/users/page.tsx', 'utf8');
  assert.match(page, /canForceDelete: session\.role === 'SYSTEM_ADMIN'/);
  assert.match(page, /canForceDelete && user\.id !== currentUserId/);
  assert.match(page, /\/users\/\$\{targetId\}\/force-delete/);
  assert.match(page, /current\.data\.filter\(\(user\) => user\.id !== targetId\)/);
  assert.match(page, /<ActionDialog[\s\S]*title="Force Delete User"[\s\S]*reasonRequired/);
});
