const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EmploymentType } = require('@prisma/client');

const { EmploymentTypeDto } = require('../dist/employees/dto/create-employee.dto');
const { DashboardService } = require('../dist/dashboard/dashboard.service');
const { LeaveRequestsService } = require('../dist/leave-requests/leave-requests.service');
const { PlacementRequestsService } = require('../dist/placement-requests/placement-requests.service');
const { ReportsService } = require('../dist/reports/reports.service');

test('STAFF_OFFICE is available in Prisma and employee DTO enums with one additive migration statement', () => {
  assert.equal(EmploymentType.STAFF_OFFICE, 'STAFF_OFFICE');
  assert.equal(EmploymentTypeDto.STAFF_OFFICE, 'STAFF_OFFICE');
  const migration = fs.readFileSync('prisma/migrations/20260910120000_add_staff_office_employment_type/migration.sql', 'utf8').trim();
  assert.equal(migration, `ALTER TYPE "EmploymentType" ADD VALUE 'STAFF_OFFICE';`);
});

test('dashboard accepts STAFF_OFFICE as an employment filter', async () => {
  const queries = [];
  const count = async (query) => { queries.push(query); return 0; };
  const service = new DashboardService({
    employee: { count }, attendance: { count }, leaveRequest: { count }, placementRequest: { count }, placement: { count },
  }, {});
  await service.summary({ userId: 'hr-1', role: 'ADMIN_HR' }, 'STAFF_OFFICE');
  assert.deepEqual(queries[0].where.AND, [{}, { employmentType: 'STAFF_OFFICE' }]);
});

test('STAFF_OFFICE placement requests use mutation and Director approval', async () => {
  let created;
  const prisma = {
    employee: { findUnique: async () => ({ id: 'employee-1', employmentType: 'STAFF_OFFICE', placements: [] }) },
    location: { findFirst: async () => ({ id: 'location-1' }) },
    placementRequest: { create: async ({ data }) => { created = { id: 'request-1', ...data }; return created; } },
  };
  const service = new PlacementRequestsService(prisma, { record: async () => {} }, { assertEmployee: async () => {} });
  await service.create({ employeeId: 'employee-1', destinationLocationId: 'location-1', startDate: '2026-09-11', reason: 'Pindah' }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(created.type, 'MUTATION');

  service.findOne = async () => ({ id: 'request-1', status: 'PENDING_HR', type: 'MUTATION' });
  prisma.placementRequest.update = async ({ data }) => ({ id: 'request-1', type: 'MUTATION', ...data });
  await service.hrReview('request-1', { approve: true }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(created.type, 'MUTATION');
});

test('STAFF_OFFICE resignation proceeds from HR to Director', () => {
  const service = new LeaveRequestsService({}, {});
  assert.equal(service.nextStatus('RESIGN', 'STAFF_OFFICE', 'HR'), 'PENDING_DIRECTOR');
});

test('placement reports use the exact Staff Kantor label', async () => {
  const service = new ReportsService({
    placement: { findMany: async () => [{
      employee: { name: 'Demo', employmentType: 'STAFF_OFFICE' }, location: { name: 'HQ' },
      startDate: new Date('2026-09-01'), endDate: null, status: 'ACTIVE',
    }] },
  }, {});
  service.render = async (_format, _sheet, _title, _columns, rows) => rows;
  const rows = await service.exportPlacements({ format: 'pdf' }, { userId: 'hr-1', role: 'ADMIN_HR' });
  assert.equal(rows[0].jenis, 'Staff Kantor');
});

test('seed reconciles only stable office staff while preserving coordinator outsourcing type', () => {
  const seed = fs.readFileSync('prisma/seed.ts', 'utf8');
  for (const employeeNumber of ['DEMO-HR-01', 'DEMO-KEU-01', 'DEMO-MKT-01']) {
    assert.match(seed, new RegExp(`employeeNumber: '${employeeNumber}', employmentType: 'STAFF_OFFICE'`));
  }
  assert.match(seed, /employeeNumber: 'DEMO-KOOR-01', employmentType: 'TENAGA_ARSIPARIS'/);
  assert.match(seed, /employmentType: profile\.employmentType/);
});
