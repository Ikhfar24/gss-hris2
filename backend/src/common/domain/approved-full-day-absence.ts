import { Prisma } from '@prisma/client';

export const ATTENDANCE_BLOCKING_LEAVE_TYPES = [
  'CUTI',
  'SAKIT',
  'IZIN_MENDADAK',
  'IZIN_LAIN',
] as const;

export function approvedFullDayAbsenceWhere(date: Date): Prisma.LeaveRequestWhereInput {
  return {
    status: 'APPROVED',
    type: { in: [...ATTENDANCE_BLOCKING_LEAVE_TYPES] },
    startDate: { lte: date },
    OR: [{ endDate: { gte: date } }, { endDate: null, startDate: date }],
  };
}
