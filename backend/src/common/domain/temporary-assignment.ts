import { dateRangesOverlap } from './date-range';

export type TemporaryAssignmentInput = {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  startDate: Date;
  endDate: Date;
  locationId: string;
};

/** Temporary work only overrides location during its approved date range. */
export function effectiveWorkLocation(
  primaryLocationId: string,
  date: Date,
  assignments: TemporaryAssignmentInput[],
): string {
  const active = assignments.find((assignment) => assignment.status === 'APPROVED'
    && dateRangesOverlap(assignment.startDate, assignment.endDate, date, date));
  return active?.locationId ?? primaryLocationId;
}
