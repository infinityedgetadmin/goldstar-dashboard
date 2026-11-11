import { describe, expect, it } from 'vitest';
import { addDaysString, formatDayLabel, formatVenueTime, isoToVenueTime, nextDayString, shiftTimesToIso } from '../time';

// Deliberately no system-timezone manipulation here — these assertions exercise exactly the
// UTC-anchored code path (`T00:00:00Z` + `formatInTimeZone(..., 'UTC', ...)`) that fix round 1's n1
// (task-2-review.md) introduced specifically so day-grid math is independent of the test runner's (or
// a manager's browser's) local timezone. If a future change reintroduces `date-fns`'s ambient-local
// `parseISO`/`format()`, these still pass on a UTC-configured CI runner but would drift on a
// non-UTC one — the real regression protection is `shifts-calendar.test.tsx`'s rendered-label
// assertions, not this file alone.

describe('addDaysString / nextDayString', () => {
  it('adds a positive number of calendar days', () => {
    expect(addDaysString('2026-08-24', 1)).toBe('2026-08-25');
    expect(addDaysString('2026-08-24', 6)).toBe('2026-08-30');
  });

  it('adding zero days is a no-op', () => {
    expect(addDaysString('2026-08-24', 0)).toBe('2026-08-24');
  });

  it('subtracts with a negative count', () => {
    expect(addDaysString('2026-08-24', -7)).toBe('2026-08-17');
  });

  it('rolls across a month boundary', () => {
    expect(addDaysString('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('nextDayString is addDaysString(date, 1)', () => {
    expect(nextDayString('2026-08-23')).toBe(addDaysString('2026-08-23', 1));
  });
});

describe('formatDayLabel', () => {
  it('formats a bare date string as a short weekday+date label, UTC-anchored', () => {
    expect(formatDayLabel('2026-08-24')).toBe('Mon Aug 24');
    expect(formatDayLabel('2026-08-30')).toBe('Sun Aug 30');
  });
});

describe('shiftTimesToIso / isoToVenueTime round-trip', () => {
  it('round-trips a same-day shift through venue-local -> UTC -> venue-local', () => {
    const { startsAt, endsAt } = shiftTimesToIso('2026-08-23', '17:00', '23:00', 'America/Indiana/Indianapolis');
    expect(isoToVenueTime(startsAt, 'America/Indiana/Indianapolis')).toBe('17:00');
    expect(isoToVenueTime(endsAt, 'America/Indiana/Indianapolis')).toBe('23:00');
  });

  it('formatVenueTime renders a 12-hour clock label', () => {
    const { startsAt } = shiftTimesToIso('2026-08-23', '17:00', '23:00', 'America/Indiana/Indianapolis');
    expect(formatVenueTime(startsAt, 'America/Indiana/Indianapolis')).toBe('5:00 PM');
  });
});
