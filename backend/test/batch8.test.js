const test = require('node:test');
const assert = require('node:assert/strict');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const { DashboardController } = require('../dist/dashboard/dashboard.controller');
const { ROLES_KEY } = require('../dist/common/decorators/roles.decorator');

const ALL_ROLES = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'];

test('Batch 8 dashboard endpoints require explicit roles', () => {
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, DashboardController.prototype.summary), ALL_ROLES);
  assert.deepEqual(Reflect.getMetadata(ROLES_KEY, DashboardController.prototype.attention), ALL_ROLES);
});

test('finance attention contains aggregate payroll cards only', async () => {
  const service = new DashboardService({
    payrollRun: { count: async () => 3 },
    payrollRevision: { count: async () => 2 },
  });
  const cards = await service.attention({ userId: 'finance-1', role: 'KEUANGAN' });

  assert.deepEqual(cards, [
    { key: 'payroll-draft', label: 'Payroll draft perlu diproses', count: 3, href: '/payroll' },
    { key: 'payroll-revision-draft', label: 'Revisi payroll draft perlu diproses', count: 2, href: '/payroll' },
  ]);
  for (const card of cards) assert.deepEqual(Object.keys(card).sort(), ['count', 'href', 'key', 'label']);
});

test('employee summary queries only the linked employee record', async () => {
  const queries = [];
  const count = async (query) => { queries.push(query); return 0; };
  const service = new DashboardService({
    employee: { count },
    attendance: { count },
    leaveRequest: { count },
    placementRequest: { count },
    placement: { count },
  });

  await service.summary({ userId: 'employee-user', role: 'KARYAWAN' });
  const scoped = queries.filter((query) => query.where.employee || query.where.user);
  assert.ok(scoped.length > 0);
  for (const query of scoped) {
    const scope = query.where.employee ?? query.where;
    assert.deepEqual(scope.user, { is: { id: 'employee-user' } });
  }
});
