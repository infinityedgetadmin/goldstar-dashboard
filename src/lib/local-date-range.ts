/**
 * Small local-date-range helpers, extracted (Task 8/9, task-89-report.md, DRY per the house rule)
 * out of `payments/payments-filters.tsx`, which defined all four inline with no other consumer.
 * `audit-filters.tsx` is the second consumer that motivated pulling them out here rather than
 * copy-pasting a third copy.
 *
 * All four work in the BROWSER'S OWN calendar day, and it is important that they agree on which
 * day that is. `todayLocal`/`daysAgoLocal` used to derive the date from `toISOString()`, which is
 * UTC — so they named a UTC day while `startOfLocalDay`/`endOfLocalDay` bracketed a LOCAL one.
 * The two only agree where local time is UTC. Everywhere west of it the pair disagrees for the
 * whole evening: at 17:00 in New York it is already the next day in UTC, so "today" resolved to
 * tomorrow's date and the window covered tomorrow — and every "today" figure in the product
 * (validations issued and redeemed, staffing, venue reports, payment filters) read zero from
 * early evening until local midnight. For a valet operator that is exactly dinner service.
 */

/** `yyyy-mm-dd` for a Date in the browser's own timezone — never via `toISOString()`, which is UTC. */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today's date as `yyyy-mm-dd`, browser-local. */
export function todayLocal(): string {
  return localYmd(new Date());
}

/** `days` days before today as `yyyy-mm-dd`, browser-local. */
export function daysAgoLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localYmd(d);
}

/**
 * Disclosed simplification (same as the original `payments-filters.tsx` comment): a multi-venue /
 * operator-wide search has no single unambiguous timezone to anchor a date range to, so the
 * boundaries use the picker's own local calendar day rather than any particular venue's timezone.
 *
 * The date-only string is parsed WITHOUT a `Z`, which JavaScript treats as local time — that is
 * deliberate and is what makes these the bounds of the viewer's own day.
 */
export function startOfLocalDay(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T00:00:00`).toISOString();
}

export function endOfLocalDay(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T23:59:59.999`).toISOString();
}
