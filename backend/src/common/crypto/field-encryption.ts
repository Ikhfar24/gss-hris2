import { createCipheriv, createDecipheriv, createHmac } from 'crypto';

export interface EncryptedFieldPayload {
  v: string;
  iv: string;
  tag: string;
  ct: string;
}

let cachedEncodedKey: string | undefined;
let cachedKey: Buffer | undefined;

function getEncryptionKey(): Buffer {
  const encodedKey = process.env.PII_ENCRYPTION_KEY || process.env.TEMP_CREDENTIAL_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error('PII_ENCRYPTION_KEY atau TEMP_CREDENTIAL_ENCRYPTION_KEY wajib dikonfigurasi.');
  }
  if (encodedKey === cachedEncodedKey && cachedKey) {
    return cachedKey;
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) {
    throw new Error('Kunci enkripsi PII harus berupa base64 32 byte.');
  }
  cachedEncodedKey = encodedKey;
  cachedKey = key;
  return key;
}

function getKeyVersion(): string {
  return process.env.PII_KEY_VERSION || process.env.TEMP_CREDENTIAL_KEY_VERSION || 'v1';
}

/**
 * Memeriksa apakah string merupakan format JSON terenkripsi PII.
 */
export function isEncryptedField(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  try {
    const parsed = JSON.parse(trimmed);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.v === 'string' &&
      typeof parsed.iv === 'string' &&
      typeof parsed.tag === 'string' &&
      typeof parsed.ct === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Mengenkripsi nilai plaintext menggunakan AES-256-GCM dengan Synthetic IV (HMAC-SHA256)
 * agar constraint @unique dan pencarian exact-match pada kolom seperti NIK tetap berfungsi.
 * Menghasilkan string JSON dengan format { v, iv, tag, ct }.
 */
export function encryptField(plaintext: string): string;
export function encryptField(plaintext: string | null | undefined): string | null;
export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext === null || plaintext === undefined) {
    return null;
  }
  if (typeof plaintext !== 'string') {
    return plaintext as any;
  }
  if (plaintext.length === 0) {
    return plaintext;
  }
  if (isEncryptedField(plaintext)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const version = getKeyVersion();
  const iv = createHmac('sha256', key).update(`${version}:${plaintext}`).digest().subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload: EncryptedFieldPayload = {
    v: version,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ct: ciphertext.toString('hex'),
  };

  return JSON.stringify(payload);
}

/**
 * Mendekripsi string JSON terenkripsi PII menggunakan AES-256-GCM.
 * Jika nilai bukan format terenkripsi (mis. data lama plaintext), dikembalikan langsung.
 */
export function decryptField(encrypted: string): string;
export function decryptField(encrypted: string | null | undefined): string | null;
export function decryptField(encrypted: string | null | undefined): string | null {
  if (encrypted === null || encrypted === undefined) {
    return null;
  }
  if (typeof encrypted !== 'string') {
    return encrypted as any;
  }
  if (encrypted.length === 0) {
    return encrypted;
  }
  if (!isEncryptedField(encrypted)) {
    return encrypted;
  }

  const key = getEncryptionKey();
  const payload: EncryptedFieldPayload = JSON.parse(encrypted.trim());
  const iv = Buffer.from(payload.iv, 'hex');
  const tag = Buffer.from(payload.tag, 'hex');
  const ciphertext = Buffer.from(payload.ct, 'hex');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}
