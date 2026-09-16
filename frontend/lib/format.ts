const timeZone = 'Asia/Jakarta';
const dateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone });
const fullDateFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone });
const shortDateFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone });
const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone });
const timeFormatter = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone });
const monthKeyFormatter = new Intl.DateTimeFormat('en', { year: 'numeric', month: '2-digit', timeZone });

function parse(value: string | Date | null | undefined) {
  if (!value) return null;
  const calendar = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value) : null;
  const result = calendar ? new Date(`${calendar[1]}-${calendar[2]}-${calendar[3]}T00:00:00+07:00`) : value instanceof Date ? value : new Date(value);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function formatDate(value: string | Date | null | undefined) { const date = parse(value); return date ? dateFormatter.format(date) : '-'; }
export function formatFullDate(value: string | Date | null | undefined) { const date = parse(value); return date ? fullDateFormatter.format(date) : '-'; }
export function formatShortDate(value: string | Date | null | undefined) { const date = parse(value); return date ? shortDateFormatter.format(date).toUpperCase() : '-'; }
export function formatMonth(value: string | Date | null | undefined) { const date = parse(value); return date ? monthFormatter.format(date) : '-'; }
export function formatTime(value: string | Date | null | undefined) { const date = parse(value); return date ? timeFormatter.format(date).replace('.', ':') : '-'; }
export function formatDateTime(value: string | Date | null | undefined) { const date = parse(value); return date ? dateTimeFormatter.format(date).replace('.', ':') : '-'; }

export function monthKey(value: string | Date | null | undefined) {
  const date = parse(value);
  if (!date) return '';
  const parts = monthKeyFormatter.formatToParts(date);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}
