const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');

// Set test environment variables before loading module
process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
process.env.PII_KEY_VERSION = 'v1';

const {
  encryptField,
  decryptField,
  isEncryptedField,
} = require('../dist/common/crypto/field-encryption');
const { PII_ENCRYPTED_FIELDS } = require('../dist/common/crypto/pii-fields');
const {
  encryptWriteArgs,
  encryptWhereArgs,
  decryptResult,
  encryptionExtension,
} = require('../dist/prisma/prisma-encryption.extension');

test('field encryption encrypts and decrypts with AES-256-GCM', () => {
  const plaintext = '3301010101950001';
  const encrypted = encryptField(plaintext);
  const encryptedAgain = encryptField(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.equal(encrypted, encryptedAgain); // Deterministic SIV for @unique & exact match
  assert.equal(isEncryptedField(encrypted), true);

  const parsed = JSON.parse(encrypted);
  assert.equal(parsed.v, 'v1');
  assert.equal(typeof parsed.iv, 'string');
  assert.equal(parsed.iv.length, 24); // 12 bytes = 24 hex chars
  assert.equal(typeof parsed.tag, 'string');
  assert.equal(parsed.tag.length, 32); // 16 bytes = 32 hex chars
  assert.equal(typeof parsed.ct, 'string');

  const decrypted = decryptField(encrypted);
  assert.equal(decrypted, plaintext);
});

test('encryptWhereArgs translates exact-match and IN filters on PII fields to match both plaintext and ciphertext', () => {
  const nik = '3301010101950001';
  const where = {
    OR: [
      { nik },
      { nik: { in: [nik] } },
      { employeeNumber: 'EMP-001' },
    ],
  };
  encryptWhereArgs(where);
  assert.deepEqual(where.OR[0].nik, { in: [nik, encryptField(nik)] });
  assert.deepEqual(where.OR[1].nik, { in: [nik, encryptField(nik)] });
  assert.equal(where.OR[2].employeeNumber, 'EMP-001');
});

test('field encryption handles null, undefined, empty, and non-encrypted strings gracefully', () => {
  assert.equal(encryptField(null), null);
  assert.equal(encryptField(undefined), null);
  assert.equal(encryptField(''), '');

  assert.equal(decryptField(null), null);
  assert.equal(decryptField(undefined), null);
  assert.equal(decryptField(''), '');
  assert.equal(decryptField('already-plaintext-value'), 'already-plaintext-value');
});

test('field encryption does not double-encrypt an already encrypted value', () => {
  const plaintext = '5432109876';
  const encryptedOnce = encryptField(plaintext);
  const encryptedTwice = encryptField(encryptedOnce);
  assert.equal(encryptedOnce, encryptedTwice);
  assert.equal(decryptField(encryptedTwice), plaintext);
});

test('tampered ciphertext or auth tag fails authentication in AES-256-GCM', () => {
  const encrypted = encryptField('sensitive-bank-account');
  const parsed = JSON.parse(encrypted);

  // Tamper with ciphertext
  const tamperedCt = parsed.ct.slice(0, -2) + (parsed.ct.slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedPayload = JSON.stringify({ ...parsed, ct: tamperedCt });
  assert.throws(() => decryptField(tamperedPayload));

  // Tamper with auth tag
  const tamperedTag = parsed.tag.slice(0, -2) + (parsed.tag.slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedTagPayload = JSON.stringify({ ...parsed, tag: tamperedTag });
  assert.throws(() => decryptField(tamperedTagPayload));
});

test('isEncryptedField validates JSON format accurately', () => {
  assert.equal(isEncryptedField(null), false);
  assert.equal(isEncryptedField(undefined), false);
  assert.equal(isEncryptedField(''), false);
  assert.equal(isEncryptedField('3301010101950001'), false);
  assert.equal(isEncryptedField('{"not":"encrypted"}'), false);
  assert.equal(isEncryptedField('{"v":"v1","iv":"12","tag":"34"}'), false);

  const valid = JSON.stringify({ v: 'v1', iv: 'a1b2c3', tag: 'd4e5f6', ct: '010203' });
  assert.equal(isEncryptedField(valid), true);
});

test('PII_ENCRYPTED_FIELDS contains exactly the 4 sensitive Employee fields', () => {
  assert.deepEqual([...PII_ENCRYPTED_FIELDS].sort(), [
    'bankAccountNumber',
    'bpjsKesehatanNumber',
    'bpjsKetenagakerjaanNumber',
    'nik',
  ]);
  assert.equal(PII_ENCRYPTED_FIELDS.includes('phone'), false);
  assert.equal(PII_ENCRYPTED_FIELDS.includes('address'), false);
  assert.equal(PII_ENCRYPTED_FIELDS.includes('dateOfBirth'), false);
  assert.equal(PII_ENCRYPTED_FIELDS.includes('dailyRate'), false);
});

test('encryptWriteArgs encrypts only PII fields on write payloads', () => {
  const args = {
    data: {
      name: 'Budi Santoso',
      nik: '3301010101950001',
      bankAccountNumber: '1234567890',
      bpjsKesehatanNumber: '0001234567890',
      bpjsKetenagakerjaanNumber: '12345678901',
      phone: '081234567890',
      jobTitle: 'Staff Arsip',
    },
  };

  encryptWriteArgs(args);

  assert.equal(args.data.name, 'Budi Santoso');
  assert.equal(args.data.phone, '081234567890');
  assert.equal(args.data.jobTitle, 'Staff Arsip');

  assert.equal(isEncryptedField(args.data.nik), true);
  assert.equal(isEncryptedField(args.data.bankAccountNumber), true);
  assert.equal(isEncryptedField(args.data.bpjsKesehatanNumber), true);
  assert.equal(isEncryptedField(args.data.bpjsKetenagakerjaanNumber), true);

  assert.equal(decryptField(args.data.nik), '3301010101950001');
  assert.equal(decryptField(args.data.bankAccountNumber), '1234567890');
  assert.equal(decryptField(args.data.bpjsKesehatanNumber), '0001234567890');
  assert.equal(decryptField(args.data.bpjsKetenagakerjaanNumber), '12345678901');
});

test('encryptWriteArgs handles createMany array data and upsert structures', () => {
  // createMany
  const manyArgs = {
    data: [
      { name: 'Emp 1', nik: '11111' },
      { name: 'Emp 2', nik: '22222' },
    ],
  };
  encryptWriteArgs(manyArgs);
  assert.equal(isEncryptedField(manyArgs.data[0].nik), true);
  assert.equal(isEncryptedField(manyArgs.data[1].nik), true);
  assert.equal(decryptField(manyArgs.data[0].nik), '11111');
  assert.equal(decryptField(manyArgs.data[1].nik), '22222');

  // upsert
  const upsertArgs = {
    create: { name: 'Emp New', nik: '33333' },
    update: { nik: '44444' },
  };
  encryptWriteArgs(upsertArgs);
  assert.equal(isEncryptedField(upsertArgs.create.nik), true);
  assert.equal(isEncryptedField(upsertArgs.update.nik), true);
  assert.equal(decryptField(upsertArgs.create.nik), '33333');
  assert.equal(decryptField(upsertArgs.update.nik), '44444');
});

test('decryptResult decrypts employee results and nested relation includes', () => {
  const encNik = encryptField('3301010101950001');
  const encBank = encryptField('9876543210');

  const single = { id: 'emp-1', name: 'Budi', nik: encNik, bankAccountNumber: encBank };
  decryptResult(single);
  assert.equal(single.nik, '3301010101950001');
  assert.equal(single.bankAccountNumber, '9876543210');

  // Array of records
  const list = [
    { id: 'emp-1', nik: encNik },
    { id: 'emp-2', nik: encryptField('12345') },
  ];
  decryptResult(list);
  assert.equal(list[0].nik, '3301010101950001');
  assert.equal(list[1].nik, '12345');

  // Nested relation include (e.g., user.employee or placement.employee)
  const nested = {
    id: 'user-1',
    employee: { id: 'emp-1', nik: encNik },
  };
  decryptResult(nested);
  assert.equal(nested.employee.nik, '3301010101950001');
});
