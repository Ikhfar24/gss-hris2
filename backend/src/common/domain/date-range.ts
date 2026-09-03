export function startOfCalendarDay(value: Date | string): Date {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function assertDateRange(start: Date | string, end?: Date | string | null): void {
  if (end && startOfCalendarDay(end) < startOfCalendarDay(start)) {
    throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai');
  }
}

/** Inclusive date ranges, matching displayed HR calendar dates. */
export function dateRangesOverlap(
  leftStart: Date | string,
  leftEnd: Date | string | null | undefined,
  rightStart: Date | string,
  rightEnd: Date | string | null | undefined,
): boolean {
  const leftEndDate = leftEnd ? startOfCalendarDay(leftEnd) : new Date(8640000000000000);
  const rightEndDate = rightEnd ? startOfCalendarDay(rightEnd) : new Date(8640000000000000);
  return startOfCalendarDay(leftStart) <= rightEndDate && startOfCalendarDay(rightStart) <= leftEndDate;
}
