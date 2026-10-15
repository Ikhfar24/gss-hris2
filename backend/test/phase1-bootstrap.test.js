const test = require('node:test');
const assert = require('node:assert/strict');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');

const { GUARDS_METADATA } = require('@nestjs/common/constants');
const { AuthController } = require('../dist/auth/auth.controller');
const { AuthService } = require('../dist/auth/auth.service');
const { JwtStrategy } = require('../dist/auth/strategies/jwt.strategy');
const { JwtAuthGuard } = require('../dist/common/guards/jwt-auth.guard');
const { RolesGuard } = require('../dist/common/guards/roles.guard');
const { BrandingController } = require('../dist/company-settings/branding.controller');
const { CompanySettingsController } = require('../dist/company-settings/company-settings.controller');
const { CompanySettingsService } = require('../dist/company-settings/company-settings.service');
const { UpdateCompanySettingsDto } = require('../dist/company-settings/dto/update-company-settings.dto');

const config = { get: (key) => (key === 'JWT_SECRET' ? 'a-32-character-minimum-jwt-secret!' : undefined) };

test('GET /auth/me is protected by JwtAuthGuard and uses current backend identity', async () => {
  const guards = Reflect.getMetadata(GUARDS_METADATA, AuthController.prototype.me);
  assert.deepEqual(guards, [JwtAuthGuard]);

  const strategy = new JwtStrategy(config, {
    user: { findUnique: async () => ({ id: 'user-1', email: 'current@example.test', role: 'KARYAWAN', isActive: true }) },
  });
  const actor = await strategy.validate({ sub: 'user-1', email: 'stale@example.test', role: 'SYSTEM_ADMIN' });
  assert.deepEqual(actor, { userId: 'user-1', email: 'current@example.test', role: 'KARYAWAN' });
});

test('auth session bootstrap exposes only authoritative user and employee shell fields', async () => {
  let query;
  const service = new AuthService({
    user: { findUnique: async (received) => {
      query = received;
      return {
        id: 'user-1', email: 'current@example.test', role: 'ADMIN_HR', isActive: true,
        employee: {
          id: 'employee-1', name: 'Safe Name', photoUrl: '/photo.jpg', jobTitle: 'Supervisor',
          employmentType: 'PKWT', status: 'ACTIVE', attendanceRequired: true,
          placements: [{ location: { name: 'Jakarta' } }],
        },
      };
    } },
  }, {}, {});

  const result = await service.me({ userId: 'user-1', email: 'stale@example.test', role: 'KARYAWAN' });
  assert.deepEqual(Object.keys(result).sort(), ['coordinatorScopeTypes', 'email', 'employee', 'id', 'role']);
  assert.deepEqual(result.coordinatorScopeTypes, []);
  assert.deepEqual(Object.keys(result.employee).sort(), [
    'activePlacementName', 'attendanceRequired', 'employmentType', 'id', 'jobTitle', 'name', 'photoUrl', 'status',
  ]);
  assert.equal(result.email, 'current@example.test');
  assert.equal(result.role, 'ADMIN_HR');
  assert.equal(result.employee.activePlacementName, 'Jakarta');
  assert.deepEqual(query.where, { id: 'user-1' });
  assert.equal(query.select.employee.select.nik, undefined);
  assert.equal(query.select.employee.select.address, undefined);
  assert.equal(query.select.employee.select.bankAccountNumber, undefined);
  assert.deepEqual(query.select.employee.select.placements.where.status.in, ['ACTIVE', 'SCHEDULED']);
  assert.ok(query.select.employee.select.placements.where.startDate.lte instanceof Date);
});

test('public branding endpoint returns the strict branding allowlist', async () => {
  assert.equal(Reflect.getMetadata(GUARDS_METADATA, BrandingController), undefined);
  assert.equal(Reflect.getMetadata(GUARDS_METADATA, BrandingController.prototype.get), undefined);

  let brandingQuery;
  const service = new CompanySettingsService({
    companySettings: { findFirst: async (query) => { brandingQuery = query; return ({
      id: 'settings-1', companyName: 'GSS', appName: 'GSS', logoUrl: '/logo.svg',
      faviconUrl: '/favicon.ico', primaryColor: '#112233', email: 'secret@example.test',
      address: 'Private address', updatedAt: new Date(), updatedById: 'admin-1',
    }); } },
  }, {});
  const result = await new BrandingController(service).get();
  assert.deepEqual(result, {
    companyName: 'GSS', appName: 'GSS', logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico', primaryColor: '#112233',
  });
  assert.deepEqual(Object.keys(brandingQuery.select).sort(), ['appName', 'companyName', 'faviconUrl', 'logoUrl', 'primaryColor']);
  assert.equal(brandingQuery.select.email, undefined);
  assert.equal(brandingQuery.select.address, undefined);
});

test('Company Settings GET and PATCH retain JwtAuthGuard, RolesGuard, and SYSTEM_ADMIN RBAC', () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, CompanySettingsController), [JwtAuthGuard, RolesGuard]);
  assert.deepEqual(Reflect.getMetadata('roles', CompanySettingsController), ['SYSTEM_ADMIN']);
  assert.equal(Reflect.getMetadata(GUARDS_METADATA, CompanySettingsController.prototype.get), undefined);
  assert.equal(Reflect.getMetadata(GUARDS_METADATA, CompanySettingsController.prototype.update), undefined);
});

test('branding configuration accepts only same-application assets and six-digit accessible color input', () => {
  const valid = plainToInstance(UpdateCompanySettingsDto, { logoUrl: '/branding/logo.svg', faviconUrl: '/branding/favicon.ico', primaryColor: '#001F3F' });
  assert.equal(validateSync(valid).length, 0);
  const external = validateSync(plainToInstance(UpdateCompanySettingsDto, { logoUrl: 'https://tracker.example/logo.svg' }));
  assert.ok(external.some((error) => error.property === 'logoUrl'));
  const backslashBypass = validateSync(plainToInstance(UpdateCompanySettingsDto, { logoUrl: '/\\tracker.example/logo.svg' }));
  assert.ok(backslashBypass.some((error) => error.property === 'logoUrl'));
  const shortColor = validateSync(plainToInstance(UpdateCompanySettingsDto, { primaryColor: '#fff' }));
  assert.ok(shortColor.some((error) => error.property === 'primaryColor'));
});
