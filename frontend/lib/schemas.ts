import { z } from 'zod';

// ─── Auth ────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Email tidak valid').transform(v => v.trim().toLowerCase()),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8, 'Password saat ini minimal 8 karakter'),
  newPassword: z.string().min(12, 'Password baru minimal 12 karakter'),
  confirmation: z.string(),
}).refine(d => d.newPassword === d.confirmation, {
  message: 'Konfirmasi password tidak cocok',
  path: ['confirmation'],
});

// ─── Session ─────────────────────────────────────────
export const ROLES = [
  'KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN',
  'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export const coordinatorScopeTypes = [
  'TENAGA_BORONGAN',
  'TENAGA_ARSIPARIS',
  'STAFF_OFFICE',
] as const;

export type CoordinatorScopeType = (typeof coordinatorScopeTypes)[number];

export const sessionEmployeeSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const copy = { ...(val as Record<string, unknown>) };
    if (!copy.fullName && typeof copy.name === 'string') copy.fullName = copy.name;
    if (!copy.name && typeof copy.fullName === 'string') copy.name = copy.fullName;
    return copy;
  }
  return val;
}, z.object({
  id: z.string(),
  fullName: z.string(),
  name: z.string().default(''),
  jobTitle: z.string().nullable().optional(),
  employmentType: z.string(),
  status: z.string(),
  attendanceRequired: z.boolean(),
  attendanceMode: z.string().optional(),
  activePlacementName: z.string().nullable().optional(),
  activePlacementLocationId: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
}));

export const sessionSchema = z.preprocess((val) => {
  if (val && typeof val === 'object') {
    const copy = { ...(val as Record<string, unknown>) };
    if (!copy.userId && typeof copy.id === 'string') copy.userId = copy.id;
    if (!copy.id && typeof copy.userId === 'string') copy.id = copy.userId;
    if (!copy.fullName) copy.fullName = (typeof copy.name === 'string' ? copy.name : '') || (typeof copy.email === 'string' ? copy.email : '');
    if (!copy.coordinatorScopeTypes) copy.coordinatorScopeTypes = [];
    return copy;
  }
  return val;
}, z.object({
  id: z.string().default(''),
  userId: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  fullName: z.string(),
  mustChangePassword: z.boolean(),
  coordinatorScopeTypes: z.array(z.enum(coordinatorScopeTypes)).default([]),
  employee: sessionEmployeeSchema.nullable().optional(),
}));

// ─── Employees ───────────────────────────────────────
export const createEmployeeSchema = z.object({
  fullName: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  nik: z.string().length(16, 'NIK harus 16 digit').regex(/^\d+$/, 'NIK hanya angka'),
  employmentType: z.enum(['TENAGA_BORONGAN', 'TENAGA_ARSIPARIS', 'STAFF_OFFICE']),
  email: z.string().email('Email tidak valid').optional().or(z.literal('')),
  phone: z.string().min(10, 'Nomor HP minimal 10 digit').optional().or(z.literal('')),
  dateOfBirth: z.string().optional(),
  address: z.string().optional(),
});

// ─── Leave ───────────────────────────────────────────
// Selaras dengan backend LeaveType di prisma/schema.prisma:
// CUTI | SAKIT | IZIN_PULANG_AWAL | IZIN_MENDADAK | IZIN_LAIN | RESIGN
export const createLeaveRequestSchema = z.object({
  type: z.enum(['CUTI', 'SAKIT', 'IZIN_PULANG_AWAL', 'IZIN_MENDADAK', 'IZIN_LAIN', 'RESIGN']),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'),
  endDate: z.string().optional(),
  reason: z.string().min(3, 'Alasan minimal 3 karakter'),
  documentBase64: z.string().optional(),
}).refine(d => d.type !== 'SAKIT' || !!d.documentBase64, {
  message: 'Surat keterangan dokter wajib untuk cuti sakit',
  path: ['documentBase64'],
});

// ─── Location ────────────────────────────────────────
export const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
