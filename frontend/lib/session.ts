export const ROLES = ['KARYAWAN', 'KOORDINATOR', 'ADMIN_HR', 'KEUANGAN', 'MARKETING', 'DIREKTUR', 'KOMISARIS', 'SYSTEM_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export interface SessionEmployee {
  id: string;
  name: string;
  photoUrl: string | null;
  jobTitle: string | null;
  employmentType: string;
  status: string;
  attendanceRequired: boolean;
  activePlacementName: string | null;
}

export interface Session {
  id: string;
  email: string;
  role: Role;
  employee: SessionEmployee | null;
  coordinatorScopeTypes: ('TENAGA_BORONGAN' | 'TENAGA_ARSIPARIS' | 'STAFF_OFFICE')[];
  mustChangePassword: boolean;
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || typeof item.email !== 'string' || !ROLES.includes(item.role as Role) || typeof item.mustChangePassword !== 'boolean') return false;
  if (!Array.isArray(item.coordinatorScopeTypes) || !item.coordinatorScopeTypes.every((scope) => scope === 'TENAGA_BORONGAN' || scope === 'TENAGA_ARSIPARIS' || scope === 'STAFF_OFFICE')) return false;
  if (item.employee === null) return true;
  if (!item.employee || typeof item.employee !== 'object') return false;
  const employee = item.employee as Record<string, unknown>;
  return typeof employee.id === 'string'
    && typeof employee.name === 'string'
    && (employee.photoUrl === null || typeof employee.photoUrl === 'string')
    && (employee.jobTitle === null || typeof employee.jobTitle === 'string')
    && typeof employee.employmentType === 'string'
    && typeof employee.status === 'string'
    && typeof employee.attendanceRequired === 'boolean'
    && (employee.activePlacementName === null || typeof employee.activePlacementName === 'string');
}
