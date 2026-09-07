import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';

const UPLOAD_ROOT = join(process.cwd(), 'uploads');
const ALLOWED_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf', // supporting documents for leave requests, §13
} as const;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function saveImageBuffer(buffer: Buffer, mime: string, subfolder: string): string {
  const ext = ALLOWED_MIME[mime as keyof typeof ALLOWED_MIME];
  if (!ext || mime === 'application/pdf' || buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !validFileSignature(buffer, mime)) {
    throw new BadRequestException('File gambar tidak valid atau melebihi 5 MB');
  }

  const dir = join(UPLOAD_ROOT, subfolder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  writeFileSync(join(dir, filename), buffer, { flag: 'wx' });

  const [kind, employeeId] = subfolder.split('/');
  if (kind === 'profile-photos' && employeeId) return `/api/v1/media/profile-photos/${employeeId}/${filename}`;
  if (kind === 'selfies' && employeeId) return `/api/v1/media/selfies/${employeeId}/${filename}`;
  throw new BadRequestException('Lokasi penyimpanan file tidak valid');
}

function validFileSignature(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') return buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  return mime === 'application/pdf' && buffer.subarray(0, 5).toString() === '%PDF-';
}

/**
 * Saves a base64 data URL (e.g. "data:image/jpeg;base64,...") to local disk
 * and returns a protected API path. Local disk is an MVP choice — swap for
 * S3/GCS in production without touching callers, since callers never get a
 * direct filesystem path.
 * Used for both selfie photos (attendance) and supporting documents (leave
 * requests, §13) — same storage mechanism, different allowed mime types.
 */
export function saveBase64File(dataUrl: string, subfolder: string, imagesOnly = false): string {
  const match = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new BadRequestException('Format file tidak valid, harus data URL base64');
  }
  const [, mime, base64Data] = match;
  const ext = ALLOWED_MIME[mime as keyof typeof ALLOWED_MIME];
  if (!ext || (imagesOnly && mime === 'application/pdf')) {
    throw new BadRequestException('Format file tidak didukung, gunakan JPEG/PNG/WebP/PDF');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data) || base64Data.length % 4 !== 0) {
    throw new BadRequestException('Data base64 file tidak valid');
  }
  const buffer = Buffer.from(base64Data, 'base64');
  const limit = imagesOnly ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
  if (buffer.length === 0 || buffer.length > limit || !validFileSignature(buffer, mime)) {
    throw new BadRequestException(imagesOnly ? 'File gambar tidak valid atau melebihi 5 MB' : 'File tidak valid atau melebihi 10 MB');
  }

  if (imagesOnly) return saveImageBuffer(buffer, mime, subfolder);

  const dir = join(UPLOAD_ROOT, subfolder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  writeFileSync(join(dir, filename), buffer, { flag: 'wx' });

  const [kind, employeeId] = subfolder.split('/');
  if (kind === 'selfies' && employeeId) return `/api/v1/media/selfies/${employeeId}/${filename}`;
  const documentEmployeeId = subfolder.split('/')[2];
  if (subfolder.startsWith('documents/leave/') && documentEmployeeId) return `/api/v1/media/leave-documents/${documentEmployeeId}/${filename}`;
  throw new BadRequestException('Lokasi penyimpanan file tidak valid');
}

export function saveBase64Image(dataUrl: string, subfolder: string): string {
  return saveBase64File(dataUrl, subfolder, true);
}

/** Maps protected and legacy public URLs to the same local file safely. */
export function resolveStoredFile(kind: 'selfies' | 'leave-documents' | 'profile-photos', employeeId: string, filename: string) {
  if (!/^[a-zA-Z0-9-]+$/.test(employeeId) || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    throw new BadRequestException('Path file tidak valid');
  }
  const relative = kind === 'selfies'
    ? `selfies/${employeeId}/${filename}`
    : kind === 'profile-photos'
      ? `profile-photos/${employeeId}/${filename}`
      : `documents/leave/${employeeId}/${filename}`;
  const absolute = resolve(UPLOAD_ROOT, relative);
  if (!absolute.startsWith(`${resolve(UPLOAD_ROOT)}${sep}`)) {
    throw new BadRequestException('Path file tidak valid');
  }
  return { absolute, relative };
}

/** Converts legacy public URLs in historical records to protected API URLs. */
export function toProtectedMediaPath(storedPath: string | null | undefined): string | null | undefined {
  if (!storedPath) return storedPath;
  const selfie = /^\/uploads\/selfies\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+)$/.exec(storedPath);
  if (selfie) return `/api/v1/media/selfies/${selfie[1]}/${selfie[2]}`;
  const leave = /^\/uploads\/documents\/leave\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+)$/.exec(storedPath);
  if (leave) return `/api/v1/media/leave-documents/${leave[1]}/${leave[2]}`;
  const profile = /^\/uploads\/profile-photos\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+)$/.exec(storedPath);
  if (profile) return `/api/v1/media/profile-photos/${profile[1]}/${profile[2]}`;
  return storedPath;
}
