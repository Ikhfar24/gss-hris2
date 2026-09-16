const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomBytes } = require('node:crypto');

const { TemporaryCredentialService } = require('../dist/temporary-credentials/temporary-credential.service');

function credentialService() {
  const values = {
    TEMP_CREDENTIAL_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    TEMP_CREDENTIAL_KEY_VERSION: 'test-v1',
  };
  return new TemporaryCredentialService({ get: (key) => values[key] });
}

test('temporary credentials use authenticated AES-256-GCM encryption', () => {
  const service = credentialService();
  const encrypted = service.encrypt('Never log or persist this plaintext');
  assert.equal(encrypted.keyVersion, 'test-v1');
  assert.equal(encrypted.iv.length, 12);
  assert.equal(encrypted.authTag.length, 16);
  assert.equal(service.decrypt(encrypted), 'Never log or persist this plaintext');

  encrypted.ciphertext[0] ^= 1;
  assert.throws(() => service.decrypt(encrypted));
});

test('generated temporary password includes each required character class', () => {
  const password = credentialService().generatePassword();
  assert.equal(password.length, 28);
  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /[0-9]/);
  assert.match(password, /[!@#$%]/);
});

test('transaction helper persists encryption fields and never plaintext', async () => {
  const service = credentialService();
  let operation;
  await service.store({ userTemporaryCredential: { upsert: async (value) => { operation = value; } } }, 'user-1', 'Secret-value-123!', 'ACCOUNT_CREATION', 'admin-1');
  assert.equal(operation.where.userId, 'user-1');
  assert.equal(operation.create.ciphertext.includes(Buffer.from('Secret-value-123!')), false);
  assert.equal('plaintext' in operation.create, false);
  assert.equal(operation.create.createdById, 'admin-1');
});

test('safe user selects expose status but never encryption material', () => {
  const source = fs.readFileSync('src/users/users.service.ts', 'utf8');
  const safeSelect = source.slice(source.indexOf('const SAFE_SELECT'), source.indexOf('@Injectable()'));
  assert.match(safeSelect, /temporaryCredential/);
  assert.doesNotMatch(safeSelect, /ciphertext|authTag|\biv\b/);
});

test('admin reveal and self-service endpoints require dedicated DTOs', () => {
  const users = fs.readFileSync('src/users/users.controller.ts', 'utf8');
  const auth = fs.readFileSync('src/auth/auth.controller.ts', 'utf8');
  assert.match(users, /temporary-credential\/reveal/);
  assert.match(users, /RevealTemporaryCredentialDto/);
  assert.match(auth, /account\/password/);
  assert.match(auth, /account\/email/);
});
