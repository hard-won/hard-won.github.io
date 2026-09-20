/**
 * One date vocabulary for the whole datasheet: `04 JUN 2024`.
 *
 * Stored calendar dates are formatted directly, with no timezone conversion.
 * A post's `displayDate` is the date it originally carried in the author's own
 * timezone; its `date` is the precise instant, which shifts a day under UTC and
 * so must never be fed to a formatter for display.
 *
 * `Intl` is deliberately not used: `en-GB` short months render `Sept`, which
 * breaks the fixed-width mono date column.
 */
const MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** `2024-06-04` -> `04 JUN 2024`. */
export function stamp(displayDate: string): string {
  const [year, month, day] = displayDate.split('-');
  return `${day} ${MONTHS[Number(month) - 1]} ${year}`;
}

/** `2024-06-04` -> `04 JUN`, for lists already grouped under a year heading. */
export function stampDay(displayDate: string): string {
  const [, month, day] = displayDate.split('-');
  return `${day} ${MONTHS[Number(month) - 1]}`;
}

/** The calendar date a `Date` carries in UTC, as `YYYY-MM-DD`. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `1 ENTRY` / `16 ENTRIES` — the count that sits beside a section label. */
export function entryCount(n: number): string {
  return `${n} ${n === 1 ? 'ENTRY' : 'ENTRIES'}`;
}
