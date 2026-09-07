const test = require('node:test');
const assert = require('node:assert/strict');

const { CoordinatorScopeService } = require('../dist/coordinator-scopes/coordinator-scope.service');
const { EmployeesService } = require('../dist/employees/employees.service');

function scopeService(scopes) {
  return new CoordinatorScopeService({
    coordinatorScope: { findMany: async () => scopes },
  });
}

test('UAT Fix Pack 02 returns only active employment-type scopes', async () => {
  const service = scopeService([{ employmentType: 'TENAGA_BORONGAN' }]);
  assert.deepEqual(await service.getTypes('coordinator-1'), ['TENAGA_BORONGAN']);
  assert.deepEqual(await service.employeeWhere('coordinator-1'), { employmentType: { in: ['TENAGA_BORONGAN'] } });
  assert.deepEqual(await service.queryWhere('coordinator-1'), { employee: { employmentType: { in: ['TENAGA_BORONGAN'] } } });
});

test('UAT Fix Pack 02 denies a coordinator with no scope', async () => {
  const service = scopeService([]);
  await assert.rejects(() => service.assertEmployee('coordinator-1', { employmentType: 'TENAGA_BORONGAN' }), /cakupan jenis tenaga/);
});

test('UAT Fix Pack 02 employee listing scopes by employment type, not legacy coordinatorId', async () => {
  let where;
  const prisma = {
    $transaction: async ([employees, total]) => [await employees, await total],
    employee: {
      findMany: async (args) => { where = args.where; return []; },
      count: async () => 0,
    },
  };
  const scopes = { employeeWhere: async () => ({ employmentType: { in: ['TENAGA_BORONGAN'] } }) };
  const service = new EmployeesService(prisma, scopes);
  await service.findAll({ userId: 'coordinator-1', email: 'coordinator@example.test', role: 'KOORDINATOR' });
  assert.deepEqual(where.employmentType, { in: ['TENAGA_BORONGAN'] });
  assert.equal(where.coordinatorId, undefined);
});
