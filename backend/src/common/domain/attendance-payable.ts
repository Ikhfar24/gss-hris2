export type PayableAttendanceInput = {
  checkInAt: Date | null;
  checkOutAt: Date | null;
  validationStatus: 'VALID' | 'NEEDS_REVIEW' | 'APPROVED_AFTER_REVIEW' | 'REJECTED';
  checkOutSource?: 'EMPLOYEE' | 'SYSTEM_AUTO_CLOSED' | 'HR_CORRECTION' | null;
};

/** A check-in alone never becomes a payable daily-work record. */
export function isPayableAttendance(record: PayableAttendanceInput): boolean {
  return !!record.checkInAt
    && !!record.checkOutAt
    && record.checkOutSource !== 'SYSTEM_AUTO_CLOSED'
    && ['VALID', 'APPROVED_AFTER_REVIEW'].includes(record.validationStatus);
}

export function payableAttendanceState(record: PayableAttendanceInput): 'PAYABLE' | 'PENDING_REVIEW' | 'NOT_PAYABLE' {
  if (record.validationStatus === 'NEEDS_REVIEW' || record.checkOutSource === 'SYSTEM_AUTO_CLOSED') return 'PENDING_REVIEW';
  return isPayableAttendance(record) ? 'PAYABLE' : 'NOT_PAYABLE';
}
