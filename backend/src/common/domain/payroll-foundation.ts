export function validatePayrollCycleDays(startDay: number, endDay: number): boolean {
  return Number.isInteger(startDay) && Number.isInteger(endDay)
    && startDay >= 1 && startDay <= 31 && endDay >= 1 && endDay <= 31;
}

export function canCreatePayrollRevision(runStatus: 'DRAFT' | 'PENDING_DIRECTOR_APPROVAL' | 'FINALIZED'): boolean {
  return runStatus === 'FINALIZED';
}
