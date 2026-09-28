import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface StoredTemporaryCredential {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: string;
}

@Injectable()
export class TemporaryCredentialService {
  private readonly key: Buffer;
  readonly keyVersion: string;
  readonly ttlMs: number;

  constructor(config: ConfigService) {
    const encodedKey = config.get<string>('TEMP_CREDENTIAL_ENCRYPTION_KEY');
    this.keyVersion = config.get<string>('TEMP_CREDENTIAL_KEY_VERSION')?.trim() ?? '';
    const ttlHours = Number(config.get<string>('TEMP_CREDENTIAL_TTL_HOURS') ?? 24);
    this.ttlMs = Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    this.key = encodedKey ? Buffer.from(encodedKey, 'base64') : Buffer.alloc(0);
    if (this.key.length !== 32 || !this.keyVersion) {
      throw new Error('TEMP_CREDENTIAL_ENCRYPTION_KEY harus base64 32 byte dan TEMP_CREDENTIAL_KEY_VERSION wajib diatur.');
    }
  }

  isExpired(createdAt: Date, now = new Date()): boolean {
    return createdAt.getTime() + this.ttlMs <= now.getTime();
  }

  generatePassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const required = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%']
      .map((set) => set[randomBytes(1)[0] % set.length]);
    const remaining = Array.from({ length: 24 }, () => alphabet[randomBytes(1)[0] % alphabet.length]);
    return [...required, ...remaining]
      .map((value) => ({ value, order: randomBytes(4).readUInt32BE() }))
      .sort((a, b) => a.order - b.order)
      .map(({ value }) => value)
      .join('');
  }

  encrypt(plaintext: string): StoredTemporaryCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: this.keyVersion };
  }

  decrypt(credential: StoredTemporaryCredential): string {
    if (credential.keyVersion !== this.keyVersion) throw new Error('Versi kunci kredensial sementara tidak tersedia');
    const decipher = createDecipheriv('aes-256-gcm', this.key, credential.iv);
    decipher.setAuthTag(credential.authTag);
    return Buffer.concat([decipher.update(credential.ciphertext), decipher.final()]).toString('utf8');
  }

  store(tx: Prisma.TransactionClient, userId: string, plaintext: string, purpose: string, createdById?: string) {
    const encrypted = this.encrypt(plaintext);
    return tx.userTemporaryCredential.upsert({
      where: { userId },
      create: { userId, purpose, createdById, ...encrypted },
      update: { purpose, createdById, createdAt: new Date(), lastRevealedAt: null, revealCount: 0, ...encrypted },
    });
  }
}
