const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validateSync } = require('class-validator');
const { EmployeesService } = require('../dist/employees/employees.service');
const { UsersService } = require('../dist/users/users.service');
const { ForceDeleteEmployeeDto } = require('../dist/employees/dto/force-delete-employee.dto');

const hr = { userId: 'hr-1', email: 'hr@example.test', role: 'ADMIN_HR' };

test('Force Delete DTO requires reason and exact HAPUS confirmation', () => {
  const invalid = Object.assign(new ForceDeleteEmployeeDto(), { reason: 'Operational request', confirmation: 'hapus' });
  assert.ok(validateSync(invalid).some((error) => error.property === 'confirmation'));
  const valid = Object.assign(new ForceDeleteEmployeeDto(), { reason: 'Operational request', confirmation: 'HAPUS' });
  assert.equal(validateSync(valid).length, 0);
});

test('ADMIN_HR force delete tombstones identity and preserves dependent rows', async () => {
  const calls = { employeeDelete: 0, employeeUpdate: null, userUpdate: null, audit: null, histories: 0 };
  const historyModel = { updateMany: async () => { calls.histories++; return { count: 1 }; } };
  const tx = {
    userTemporaryCredential: { deleteMany: async () => ({ count: 1 }) },
    user: { update: async (input) => { calls.userUpdate = input; } },
    placement: historyModel,
    contract: historyModel,
    placementRequest: historyModel,
    leaveRequest: historyModel,
    overtimeRequest: historyModel,
    temporaryAssignment: historyModel,
    employeeProfileChangeRequest: historyModel,
    employee: {
      update: async (input) => { calls.employeeUpdate = input; },
      delete: async () => { calls.employeeDelete++; },
    },
    auditLog: { create: async ({ data }) => { calls.audit = data; } },
  };
  const prisma = {
    employee: { findUnique: async () => ({ id: 'employee-1', name: 'Budi', employeeNumber: 'NIP-01', deletedAt: null, user: { id: 'user-1' }, _count: { attendances: 5, leaveRequests: 1, placements: 2, contracts: 1, payrollSlips: 3, profileChangeRequests: 0, leaveBalances: 1, temporaryAssignments: 0, absenceCases: 1, overtimeRequests: 0 } }) },
    $transaction: async (callback) => callback(tx),
  };
  const service = new EmployeesService(prisma, {}, {});
  const result = await service.forceDelete('employee-1', 'Permintaan resmi HR', 'HAPUS', hr);
  assert.equal(result.strategy, 'ANONYMIZED_TOMBSTONE');
  assert.equal(calls.employeeDelete, 0);
  assert.equal(calls.employeeUpdate.data.nik, null);
  assert.equal(calls.employeeUpdate.data.employeeNumber, null);
  assert.equal(calls.employeeUpdate.data.status, 'TERMINATED');
  assert.equal(calls.employeeUpdate.data.attendanceRequired, false);
  assert.equal(calls.userUpdate.data.isActive, false);
  assert.equal(calls.userUpdate.data.employeeId, null);
  assert.equal(calls.histories, 7);
  assert.equal(calls.audit.action, 'EMPLOYEE_FORCE_DELETE');
  assert.deepEqual(calls.audit.newValue.strategy, 'ANONYMIZED_TOMBSTONE');
});

test('Force Delete implementation is protected and device binding is absent', () => {
  const controller = fs.readFileSync('src/employees/employees.controller.ts', 'utf8');
  const employeePage = fs.readFileSync('../frontend/app/(dashboard)/employees/page.tsx', 'utf8');
  const attendanceController = fs.readFileSync('src/attendance/attendance.controller.ts', 'utf8');
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  assert.match(controller, /@Roles\(Role\.ADMIN_HR, Role\.SYSTEM_ADMIN\)[\s\S]*@Post\(':id\/force-delete'\)/);
  assert.match(employeePage, /Force Delete Employee/);
  assert.match(employeePage, /forceDeleteConfirmation !== "HAPUS"/);
  assert.doesNotMatch(attendanceController, /devices|resetDevice|listDevices/i);
  assert.doesNotMatch(schema, /model EmployeeDevice|checkInDeviceId|checkOutDeviceId/);
  assert.match(schema, /checkInLatitude|checkInSelfieUrl|checkInClientRecordedAt/);
});

test('temporary-password enforcement is backend authoritative', () => {
  const guard = fs.readFileSync('src/common/guards/jwt-auth.guard.ts', 'utf8');
  assert.match(guard, /request\.user\?\.mustChangePassword/);
  assert.match(guard, /auth\/account\/password/);
  assert.match(guard, /ForbiddenException/);
});

test('Director monitoring omits temporary-credential lifecycle metadata', async () => {
  const record = { id: 'user-1', name: 'User', role: 'KARYAWAN', temporaryCredential: { revealCount: 4 } };
  const prisma = {
    user: { findMany: async () => [record], count: async () => 1 },
    $transaction: async (operations) => Promise.all(operations),
  };
  const service = new UsersService(prisma, {});
  const directorResult = await service.findAll({}, { userId: 'director-1', role: 'DIREKTUR' });
  assert.equal('temporaryCredential' in directorResult.data[0], false);
  const hrResult = await service.findAll({}, hr);
  assert.equal(hrResult.data[0].temporaryCredential.available, true);
  assert.equal(hrResult.data[0].temporaryCredential.revealCount, 4);
});
