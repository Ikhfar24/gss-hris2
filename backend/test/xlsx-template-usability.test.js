const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { ClientsService } = require('../dist/clients/clients.service');
const { LocationsService } = require('../dist/locations/locations.service');
const { EmployeesService } = require('../dist/employees/employees.service');

const contracts = {
  Employee: {
    sheet: 'Employees',
    headers: ['name', 'nik', 'employeeNumber', 'phone', 'address', 'email', 'dateOfBirth', 'gender', 'bankAccountNumber', 'bpjsKesehatanNumber', 'bpjsKetenagakerjaanNumber', 'jobTitle', 'photoUrl', 'employmentType', 'status', 'joinDate', 'trainingEndDate', 'coordinatorId', 'dailyRate', 'initialLocationReference', 'attendanceRequired', 'attendanceExemptionReason', 'attendanceMode', 'provisionUser', 'loginEmail', 'userRole'],
  },
  Location: {
    sheet: 'Locations',
    headers: ['referenceCode', 'name', 'clientReference', 'address', 'latitude', 'longitude', 'radiusMeters', 'checkInTime', 'checkOutTime', 'toleranceMin', 'workDays', 'isActive'],
  },
  Client: {
    sheet: 'Clients',
    headers: ['referenceCode', 'name', 'address', 'contactPerson', 'contactPhone', 'isActive'],
  },
};

async function reopen(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function upload(buffer) {
  return { buffer, originalname: 'import.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

function populateFirstDataRow(workbook, values) {
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values.slice(1);
  sheet.getRow(2).values = headers.map((header) => values[header]);
}

async function serialized(workbook) {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test('all generated import templates have exact headers and readable complete instructions', async () => {
  const templates = [
    ['Employee', await new EmployeesService({}).importTemplate()],
    ['Location', await new LocationsService({}, {}).importTemplate()],
    ['Client', await new ClientsService({}, {}).importTemplate()],
  ];

  for (const [name, buffer] of templates) {
    const workbook = await reopen(buffer);
    const contract = contracts[name];
    const data = workbook.getWorksheet(contract.sheet);
    const instructions = workbook.getWorksheet('Instructions');
    assert.ok(data);
    assert.ok(instructions);
    assert.deepEqual(data.getRow(1).values.slice(1), contract.headers);
    assert.equal(data.rowCount, 1, `${name} data sheet must not contain importable example rows`);
    assert.equal(instructions.rowCount, contract.headers.length + 1);
    assert.equal(data.views[0].ySplit, 1);
    assert.equal(instructions.views[0].ySplit, 1);
    assert.ok(data.autoFilter);
    assert.ok(instructions.autoFilter);

    for (let rowNumber = 2; rowNumber <= instructions.rowCount; rowNumber++) {
      const values = instructions.getRow(rowNumber).values.slice(1);
      const [field, requirement, type, description, , example] = values;
      assert.equal(field, contract.headers[rowNumber - 2]);
      assert.ok(['Wajib', 'Opsional'].includes(requirement));
      assert.ok(String(type).length >= 4);
      assert.ok(String(description).length >= 12, `${name}.${field} needs a meaningful description`);
      assert.notEqual(String(description).trim(), '33');
      assert.ok(example !== null && example !== undefined && String(example).trim() !== '', `${name}.${field} needs an example`);
      assert.notEqual(String(example).trim(), '33');
    }
  }
});

test('Employee instructions explain every enum and keep Role separate from Employment Type', async () => {
  const workbook = await reopen(await new EmployeesService({}).importTemplate());
  const rows = Object.fromEntries(workbook.getWorksheet('Instructions').getRows(2, contracts.Employee.headers.length).map((row) => [row.getCell(1).value, row.values.slice(1)]));
  assert.match(rows.gender.join(' '), /MALE, FEMALE/);
  assert.match(rows.employmentType.join(' '), /TENAGA_BORONGAN.*TENAGA_ARSIPARIS.*STAFF_OFFICE/);
  assert.match(rows.employmentType.join(' '), /Staff Kantor/);
  assert.match(rows.status.join(' '), /TRAINING.*ACTIVE.*INACTIVE.*ON_LEAVE.*RESIGNED.*TERMINATED/);
  assert.match(rows.attendanceMode.join(' '), /GEOFENCE.*radius.*MOBILE.*tidak membatasi radius/i);
  assert.match(rows.attendanceRequired.join(' '), /TRUE.*FALSE/);
  assert.match(rows.provisionUser.join(' '), /transaksi import yang sama/);
  assert.match(rows.userRole.join(' '), /Role mengatur kewenangan aplikasi dan terpisah dari Employment Type/);
  for (const role of ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN']) assert.match(rows.userRole.join(' '), new RegExp(role));

  const data = workbook.getWorksheet('Employees');
  assert.equal(data.getCell('N2').dataValidation.type, 'list');
  assert.equal(data.getCell('X2').dataValidation.type, 'list');
  assert.equal(data.getCell('A2').value, null);
});

test('generated Employee, Location, and Client templates remain accepted by preview importers', async () => {
  const employeeService = new EmployeesService({
    employee: { findMany: async () => [] },
    location: { findMany: async () => [{ id: 'location-ok', referenceCode: 'LOC-PURWOKERTO' }] },
    user: { findMany: async () => [] },
  });
  const employeeWorkbook = await reopen(await employeeService.importTemplate());
  populateFirstDataRow(employeeWorkbook, { name: 'Budi Santoso', nik: '3301010101950001', employmentType: 'TENAGA_ARSIPARIS', joinDate: '2026-09-01', initialLocationReference: 'loc-purwokerto', attendanceRequired: true, attendanceMode: 'GEOFENCE', provisionUser: false });
  const employeePreview = await employeeService.previewXlsxImport(upload(await serialized(employeeWorkbook)));
  assert.equal(employeePreview.valid, true);
  assert.deepEqual({ totalRows: employeePreview.totalRows, validCount: employeePreview.validCount, invalidCount: employeePreview.invalidCount }, { totalRows: 1, validCount: 1, invalidCount: 0 });
  assert.equal(employeePreview.rows[0].data.initialLocationId, 'location-ok');
  assert.equal(employeePreview.rows[0].errors.length, 0);

  const locationService = new LocationsService({ client: { findMany: async () => [{ id: 'client-ok', referenceCode: 'CL-SINAR-ABADI' }] }, location: { findMany: async () => [] } }, {});
  const locationWorkbook = await reopen(await locationService.importTemplate());
  populateFirstDataRow(locationWorkbook, { referenceCode: 'loc-purwokerto', name: 'Kantor Cabang Purwokerto', clientReference: 'cl-sinar-abadi', address: 'Jl. Sudirman No. 20', latitude: -7.4246, longitude: 109.2302, radiusMeters: 150, checkInTime: '08:00', checkOutTime: '16:00', toleranceMin: 10, workDays: '1,2,3,4,5', isActive: true });
  const locationPreview = await locationService.previewImport(upload(await serialized(locationWorkbook)));
  assert.equal(locationPreview.valid, true);
  assert.equal(locationPreview.rows[0].data.referenceCode, 'LOC-PURWOKERTO');
  assert.equal(locationPreview.rows[0].data.clientId, 'client-ok');
  assert.equal(locationPreview.rows[0].errors.length, 0);

  const clientService = new ClientsService({ client: { findMany: async () => [] } }, {});
  const clientWorkbook = await reopen(await clientService.importTemplate());
  populateFirstDataRow(clientWorkbook, { referenceCode: 'cl-sinar-abadi', name: 'PT Sinar Abadi', address: 'Jl. Gatot Subroto No. 15', contactPerson: 'Siti Rahmawati', contactPhone: '081298765432', isActive: true });
  const clientPreview = await clientService.previewImport(upload(await serialized(clientWorkbook)));
  assert.equal(clientPreview.valid, true);
  assert.equal(clientPreview.rows[0].data.referenceCode, 'CL-SINAR-ABADI');
  assert.equal(clientPreview.rows[0].errors.length, 0);
});

test('legacy relation headers and exact internal ID values remain accepted', async () => {
  const locationService = new LocationsService({
    client: { findMany: async () => [{ id: 'legacy-client-id', referenceCode: 'CL-NEW' }] },
    location: { findMany: async () => [] },
  }, {});
  const locationWorkbook = await reopen(await locationService.importTemplate());
  locationWorkbook.worksheets[0].getCell('C1').value = 'Client ID';
  populateFirstDataRow(locationWorkbook, { referenceCode: 'LOC-LEGACY', name: 'Legacy Location', 'Client ID': 'legacy-client-id', latitude: -7.4, longitude: 109.2 });
  const locationPreview = await locationService.previewImport(upload(await serialized(locationWorkbook)));
  assert.equal(locationPreview.valid, true);
  assert.equal(locationPreview.rows[0].data.clientId, 'legacy-client-id');

  const employeeService = new EmployeesService({
    employee: { findMany: async () => [] },
    location: { findMany: async () => [{ id: 'legacy-location-id', referenceCode: 'LOC-NEW' }] },
    user: { findMany: async () => [] },
  });
  const employeeWorkbook = await reopen(await employeeService.importTemplate());
  employeeWorkbook.worksheets[0].getCell('T1').value = 'initial_location_id';
  populateFirstDataRow(employeeWorkbook, { name: 'Legacy Employee', employmentType: 'STAFF_OFFICE', joinDate: '2026-09-01', initial_location_id: 'legacy-location-id' });
  const employeePreview = await employeeService.previewXlsxImport(upload(await serialized(employeeWorkbook)));
  assert.equal(employeePreview.valid, true);
  assert.equal(employeePreview.rows[0].data.initialLocationId, 'legacy-location-id');
});

test('preview counts classify invalid rows rather than individual messages', async () => {
  const service = new ClientsService({ client: { findMany: async () => [] } }, {});
  const workbook = await reopen(await service.importTemplate());
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(1).values.slice(1);
  sheet.getRow(2).values = headers.map((header) => ({ referenceCode: 'CL-VALID', name: 'Valid' })[header]);
  sheet.getRow(3).values = headers.map((header) => ({ referenceCode: 'bad code', name: '' })[header]);
  const preview = await service.previewImport(upload(await serialized(workbook)));
  assert.deepEqual({ totalRows: preview.totalRows, validCount: preview.validCount, invalidCount: preview.invalidCount }, { totalRows: 2, validCount: 1, invalidCount: 1 });
  assert.equal(preview.errors.length, 1);
  assert.ok(preview.errors[0].errors.length > 1);
});
