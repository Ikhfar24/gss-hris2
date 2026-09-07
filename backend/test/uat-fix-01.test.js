const test = require('node:test');
const assert = require('node:assert/strict');

const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');

function leaveService() {
  let receivedWhere;
  const service = new LeaveRequestsService({
    leaveRequest: {
      findMany: async ({ where }) => {
        receivedWhere = where;
        return [];
      },
    },
    user: { findUnique: async () => ({ employeeId: 'employee-1' }) },
  });
  return { service, where: () => receivedWhere };
}

test('UAT Fix Pack 01 scopes operational-role leave listings to the linked employee', async () => {
  for (const role of ['KEUANGAN', 'MARKETING', 'KOMISARIS']) {
    const { service, where } = leaveService();
    await service.findAll({ userId: 'user-1', email: 'operations@example.test', role });
    assert.deepEqual(where(), { employeeId: 'employee-1' }, role);
  }
});

test('UAT Fix Pack 01 limits Director leave listings to their approval stage', async () => {
  const { service, where } = leaveService();
  await service.findAll({ userId: 'director-1', email: 'director@example.test', role: 'DIREKTUR' });
  assert.deepEqual(where(), { status: 'PENDING_DIRECTOR' });
});

test('UAT Fix Pack 01 retains organization leave listings for HR workflow roles', async () => {
  for (const role of ['ADMIN_HR', 'SYSTEM_ADMIN']) {
    const { service, where } = leaveService();
    await service.findAll({ userId: 'admin-1', email: 'admin@example.test', role });
    assert.equal(where(), undefined, role);
  }
});

test('UAT Fix Pack 01 retains employee and coordinator self-service scopes', async () => {
  const employee = leaveService();
  await employee.service.findAll({ userId: 'user-1', email: 'employee@example.test', role: 'KARYAWAN' });
  assert.deepEqual(employee.where(), { employeeId: 'employee-1' });

  const coordinator = leaveService();
  await coordinator.service.findAll({ userId: 'coordinator-1', email: 'coordinator@example.test', role: 'KOORDINATOR' });
  assert.deepEqual(coordinator.where(), { employee: { coordinatorId: 'coordinator-1' } });
});
