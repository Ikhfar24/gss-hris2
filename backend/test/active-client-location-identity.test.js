const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ExcelJS = require('exceljs');
const { ClientsService } = require('../dist/clients/clients.service');
const { LocationsService } = require('../dist/locations/locations.service');

const hr = { userId: 'hr-1', email: 'hr@example.test', role: 'ADMIN_HR' };

async function workbookFile(headers, values) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow(headers);
  sheet.addRow(values);
  return { buffer: Buffer.from(await workbook.xlsx.writeBuffer()), originalname: 'import.xlsx', mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

function selected(record, select) {
  if (!select) return { ...record };
  return Object.fromEntries(Object.keys(select).map((key) => [key, record[key]]));
}

function matchesIdentity(record, where) {
  if (where.deletedAt === null && record.deletedAt !== null) return false;
  if (where.id?.not && record.id === where.id.not) return false;
  if (!where.OR) return true;
  return where.OR.some((clause) => {
    if (clause.referenceCode?.in) return clause.referenceCode.in.includes(record.referenceCode);
    if (typeof clause.referenceCode === 'string') return clause.referenceCode === record.referenceCode;
    if (clause.name?.in) return clause.name.in.some((name) => name.toLowerCase() === record.name.toLowerCase());
    if (clause.name?.equals) return clause.name.equals.toLowerCase() === record.name.toLowerCase() && (!Object.hasOwn(clause, 'clientId') || clause.clientId === record.clientId);
    return false;
  });
}

function clientHarness() {
  const records = [];
  let sequence = 0;
  const client = {
    findMany: async ({ where = {}, select } = {}) => records.filter((record) => matchesIdentity(record, where)).map((record) => selected(record, select)),
    findUnique: async ({ where }) => records.find((record) => record.id === where.id) ?? null,
    findFirst: async ({ where }) => {
      const record = typeof where.id === 'string'
        ? records.find((candidate) => candidate.id === where.id && (where.deletedAt !== null || candidate.deletedAt === null))
        : records.find((candidate) => matchesIdentity(candidate, where));
      return record ? { ...record, _count: { locations: 0, payrollCycleSettings: 0, temporaryAssignments: 0 } } : null;
    },
    create: async ({ data, select }) => {
      const name = data.name.trim().toLowerCase();
      if (records.some((record) => record.deletedAt === null && (record.referenceCode === data.referenceCode || record.name.trim().toLowerCase() === name))) throw new Error('database active unique violation');
      const record = { id: `client-${++sequence}`, isActive: true, deletedAt: null, deletedById: null, deletionReason: null, ...data };
      records.push(record);
      return selected(record, select);
    },
    update: async ({ where, data }) => {
      const record = records.find((candidate) => candidate.id === where.id);
      Object.assign(record, data);
      return { ...record };
    },
  };
  const tx = { client, payrollCycleSetting: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => ({}) } };
  const prisma = { client, $transaction: async (callback) => callback(tx) };
  return { records, service: new ClientsService(prisma, { record: async () => ({}) }) };
}

function locationHarness() {
  const records = [];
  let sequence = 0;
  const location = {
    findMany: async ({ where = {}, select } = {}) => records.filter((record) => matchesIdentity(record, where)).map((record) => selected(record, select)),
    findUnique: async ({ where }) => records.find((record) => record.id === where.id) ?? null,
    findFirst: async ({ where }) => {
      const record = typeof where.id === 'string'
        ? records.find((candidate) => candidate.id === where.id && (where.deletedAt !== null || candidate.deletedAt === null))
        : records.find((candidate) => matchesIdentity(candidate, where));
      return record ? { ...record, _count: { placements: 0, placementRequestsFrom: 0, placementRequestsTo: 0, attendances: 0, holidays: 0, payrollCycleSettings: 0, temporaryAssignments: 0 } } : null;
    },
    create: async ({ data, select }) => {
      const key = `${data.clientId ?? ''}\0${data.name.trim().toLowerCase()}`;
      if (records.some((record) => record.deletedAt === null && (record.referenceCode === data.referenceCode || `${record.clientId ?? ''}\0${record.name.trim().toLowerCase()}` === key))) throw new Error('database active unique violation');
      const record = { id: `location-${++sequence}`, isActive: true, deletedAt: null, deletedById: null, deletionReason: null, ...data, clientId: data.clientId ?? null };
      records.push(record);
      return selected(record, select);
    },
    update: async ({ where, data }) => {
      const record = records.find((candidate) => candidate.id === where.id);
      Object.assign(record, data);
      return { ...record };
    },
  };
  const noOp = { updateMany: async () => ({ count: 0 }) };
  const tx = { location, placement: noOp, placementRequest: noOp, temporaryAssignment: noOp, payrollCycleSetting: noOp, auditLog: { create: async () => ({}) } };
  const prisma = { location, client: { findMany: async () => [], findFirst: async () => null }, $transaction: async (callback) => callback(tx) };
  return { records, service: new LocationsService(prisma, { record: async () => ({}) }) };
}

test('schema migration reserves Client and Location names and codes only for active rows', () => {
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const migration = fs.readFileSync('prisma/migrations/20260924120000_active_client_location_identity/migration.sql', 'utf8');
  const clientModel = schema.match(/model Client \{[\s\S]*?\n\}/)[0];
  const locationModel = schema.match(/model Location \{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(clientModel, /referenceCode\s+String\s+@unique/);
  assert.doesNotMatch(locationModel, /referenceCode\s+String\s+@unique/);
  assert.match(migration, /DROP INDEX "clients_referenceCode_key"/);
  assert.match(migration, /UNIQUE INDEX[\s\S]+ON "clients" \("referenceCode"\)[\s\S]+WHERE "deletedAt" IS NULL/);
  assert.match(migration, /UNIQUE INDEX[\s\S]+ON "locations" \("referenceCode"\)[\s\S]+WHERE "deletedAt" IS NULL/);
  assert.match(migration, /LOWER\(BTRIM\("name"\)\)/);
});

test('Client identity can be recreated and imported after tombstoning but active duplicates are rejected', async () => {
  const { records, service } = clientHarness();
  const dto = { referenceCode: 'CL-ALPHA', name: 'PT Alpha' };
  const first = await service.create(dto, hr);
  await service.forceDelete(first.id, 'Client retired', hr);
  const recreated = await service.create(dto, hr);
  assert.notEqual(recreated.id, first.id);
  assert.equal(records.find((record) => record.id === first.id).deletedAt instanceof Date, true);
  await service.forceDelete(recreated.id, 'Prepare import reuse', hr);

  const file = await workbookFile(['referenceCode', 'name', 'address', 'contactPerson', 'contactPhone', 'isActive'], ['CL-ALPHA', 'PT Alpha', '', '', '', true]);
  const preview = await service.previewImport(file);
  assert.equal(preview.valid, true);
  assert.equal((await service.commitImport(file, hr)).created, 1);
  const duplicatePreview = await service.previewImport(file);
  assert.equal(duplicatePreview.valid, false);
  assert.match(duplicatePreview.errors[0].errors.join(' '), /duplikat|sudah digunakan/);
  await assert.rejects(() => service.create(dto, hr), /duplikat|sudah digunakan/);
  const other = await service.create({ referenceCode: 'CL-BETA', name: 'PT Beta' }, hr);
  await assert.rejects(() => service.update(other.id, { name: 'PT Alpha' }, hr), /duplikat/);
  await assert.rejects(() => service.update(other.id, { referenceCode: 'CL-ALPHA' }, hr), /sudah digunakan/);
});

test('Location identity can be recreated and imported after tombstoning but active duplicates are rejected', async () => {
  const { records, service } = locationHarness();
  const dto = { referenceCode: 'LOC-ALPHA', name: 'Kantor Alpha', address: 'Purwokerto', latitude: -7.4253, longitude: 109.2397, radiusMeters: 150 };
  const first = await service.create(dto, hr);
  await service.forceDelete(first.id, 'Location retired', hr);
  const recreated = await service.create(dto, hr);
  assert.notEqual(recreated.id, first.id);
  assert.equal(records.find((record) => record.id === first.id).deletedAt instanceof Date, true);
  await service.forceDelete(recreated.id, 'Prepare import reuse', hr);

  const file = await workbookFile(
    ['referenceCode', 'name', 'clientReference', 'address', 'latitude', 'longitude', 'radiusMeters', 'checkInTime', 'checkOutTime', 'toleranceMin', 'workDays', 'isActive'],
    ['LOC-ALPHA', 'Kantor Alpha', '', 'Purwokerto', -7.4253, 109.2397, 150, '08:00', '16:00', 10, '1,2,3,4,5', true],
  );
  const preview = await service.previewImport(file);
  assert.equal(preview.valid, true);
  assert.equal((await service.commitImport(file, hr)).created, 1);
  const duplicatePreview = await service.previewImport(file);
  assert.equal(duplicatePreview.valid, false);
  assert.match(duplicatePreview.errors[0].errors.join(' '), /duplikat|sudah digunakan/);
  await assert.rejects(() => service.create(dto, hr), /duplikat|sudah digunakan/);
  const other = await service.create({ ...dto, referenceCode: 'LOC-BETA', name: 'Kantor Beta' }, hr);
  await assert.rejects(() => service.update(other.id, { name: 'Kantor Alpha' }, hr), /duplikat/);
  await assert.rejects(() => service.update(other.id, { referenceCode: 'LOC-ALPHA' }, hr), /sudah digunakan/);
});
