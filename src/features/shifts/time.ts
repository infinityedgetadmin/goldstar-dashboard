import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Shared venue-timezone time helpers (Task 2 brief: "all displays in venue timezone"). Extracted
 * here rather than duplicated — `shift-editor-dialog.tsx` (save + edit-mode defaults),
 * `shifts-calendar.tsx` (card display), and `clock-audit-panel.tsx` (timeline display) all need the
 * same venue-local <-> UTC conversion.
 */

/**
 * Adds `n` calendar days (negative to go backward) to a `yyyy-MM-dd` string. Plain UTC date
 * arithmetic — this is calendar-date math (which day comes after/before this one), not a
 * wall-clock/timezone conversion, so it's deliberately anchored at `T00:00:00Z` rather than parsed
 * with `date-fns`'s `parseISO` (which resolves a bare date string at the BROWSER's ambient local
 * midnight, not UTC — harmless when the manager's OS timezone happens to match the venue's, wrong
 * otherwise). Fix round 1, n1 (task-2-review.md): `shifts-calendar.tsx`'s day-grid used to build its
 * 7 days with `addDays(parseISO(weekStart), i)` directly, inconsistent with this exact anchoring
 * already used everywhere else in this feature (`shiftTimesToIso` below, `page.tsx`'s week-nav).
 */
export function addDaysString(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Adds one calendar day to a `yyyy-MM-dd` string. See {@link addDaysString}. */
export function nextDayString(dateStr: string): string {
  return addDaysString(dateStr, 1);
}

/**
 * Converts a shift's venue-local `date` (`yyyy-MM-dd`) + `HH:mm` starts/ends into UTC ISO instants
 * via `date-fns-tz`'s `fromZonedTime` — the input strings carry no offset, so `fromZonedTime`
 * interprets them as wall-clock time IN `timezone` and resolves the correct UTC instant (including
 * DST). An overnight shift (`endsAt <= startsAt` as `HH:mm` strings) rolls the END onto the NEXT
 * calendar day — 22:00 -> 02:00 runs forward across midnight, not backward.
 */
export function shiftTimesToIso(date: string, startsAt: string, endsAt: string, timezone: string): { startsAt: string; endsAt: string } {
  const startsAtIso = fromZonedTime(`${date}T${startsAt}:00`, timezone).toISOString();
  const endDate = endsAt <= startsAt ? nextDayString(date) : date;
  const endsAtIso = fromZonedTime(`${endDate}T${endsAt}:00`, timezone).toISOString();
  return { startsAt: startsAtIso, endsAt: endsAtIso };
}

/** Formats a UTC ISO instant as an `HH:mm` wall-clock string in the given venue timezone — the
 * inverse of {@link shiftTimesToIso}'s per-field conversion (populates the edit-mode form). */
export function isoToVenueTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, 'HH:mm');
}

/** Formats a UTC ISO instant as a short venue-local date+time string for display, e.g. "Aug 23, 5:00 PM". */
export function formatVenueDateTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, 'MMM d, h:mm a');
}

/** Formats a UTC ISO instant as a venue-local `h:mm a` time only, e.g. "5:00 PM". */
export function formatVenueTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, 'h:mm a');
}

/**
 * Formats a bare `yyyy-MM-dd` calendar-date string as a short label, e.g. "Sun Aug 23" — for the
 * calendar's day-column headers. Deliberately formatted at `timeZone: 'UTC'` against the same
 * `T00:00:00Z`-anchored instant {@link addDaysString} produces, NOT `date-fns`'s plain `format()`
 * (which would read the Date object's LOCAL wall-clock fields — a UTC midnight instant read that way
 * in a negative-UTC-offset browser timezone renders as the PREVIOUS day's evening, silently shifting
 * every date label back by one day). Fix round 1, n1 (task-2-review.md).
 */
export function formatDayLabel(dateStr: string): string {
  return formatInTimeZone(`${dateStr}T00:00:00Z`, 'UTC', 'EEE MMM d');
}
