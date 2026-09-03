// Mirrors prisma Role enum; kept separate so non-Prisma layers (guards,
// decorators) don't need to import the generated client directly.
export enum Role {
  KARYAWAN = 'KARYAWAN',
  KOORDINATOR = 'KOORDINATOR',
  ADMIN_HR = 'ADMIN_HR',
  KEUANGAN = 'KEUANGAN',
  MARKETING = 'MARKETING',
  DIREKTUR = 'DIREKTUR',
  KOMISARIS = 'KOMISARIS',
  SYSTEM_ADMIN = 'SYSTEM_ADMIN',
}
