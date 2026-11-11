import { describe, expect, it, vi, afterEach } from 'vitest';
import { daysAgoLocal, endOfLocalDay, startOfLocalDay, todayLocal } from '../local-date-range';

describe('local-date-range', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('todayLocal returns today as yyyy-mm-dd', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T15:00:00.000Z'));
    expect(todayLocal()).toBe('2026-08-23');
  });

  it('daysAgoLocal subtracts the given number of days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T15:00:00.000Z'));
    expect(daysAgoLocal(7)).toBe('2026-08-16');
    expect(daysAgoLocal(0)).toBe('2026-08-23');
  });

  it('startOfLocalDay anchors to 00:00:00.000 local', () => {
    const iso = startOfLocalDay('2026-08-23');
    expect(new Date(iso).getHours()).toBe(0);
    expect(new Date(iso).getMinutes()).toBe(0);
    expect(new Date(iso).getSeconds()).toBe(0);
  });

  it('endOfLocalDay anchors to 23:59:59.999 local', () => {
    const iso = endOfLocalDay('2026-08-23');
    const d = new Date(iso);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
    expect(d.getSeconds()).toBe(59);
    expect(d.getMilliseconds()).toBe(999);
  });

  /**
   * The invariant that actually matters, and the one the original bug broke: whatever "now" is,
   * it must fall inside today's own window. `todayLocal` used to derive the date from
   * `toISOString()` (UTC) while the bounds are local, so anywhere west of UTC the two named
   * different days for the whole evening — "today" pointed at tomorrow and every today-scoped
   * figure in the product read zero from early evening until local midnight.
   *
   * Written as a property over the full 24 hours rather than one pinned instant, so it holds in
   * any timezone the suite runs in — the existing cases above all used 15:00 UTC, which is the
   * one part of the day where the UTC and local dates agree in the Americas, which is exactly why
   * they never caught it.
   */
  it('now always falls inside today\'s own window, at every hour of the day', () => {
    vi.useFakeTimers();
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(Date.UTC(2026, 7, 23, hour, 30, 0));
      vi.setSystemTime(now);
      const start = new Date(startOfLocalDay(todayLocal())).getTime();
      const end = new Date(endOfLocalDay(todayLocal())).getTime();
      expect(now.getTime(), `hour ${hour}:30 UTC fell outside today's window`).toBeGreaterThanOrEqual(start);
      expect(now.getTime(), `hour ${hour}:30 UTC fell outside today's window`).toBeLessThanOrEqual(end);
    }
  });

  it('todayLocal tracks the LOCAL calendar date, not the UTC one', () => {
    vi.useFakeTimers();
    for (let hour = 0; hour < 24; hour++) {
      const now = new Date(Date.UTC(2026, 7, 23, hour, 30, 0));
      vi.setSystemTime(now);
      const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(todayLocal()).toBe(expected);
    }
  });

  it('startOfLocalDay is strictly before endOfLocalDay for the same date', () => {
    expect(new Date(startOfLocalDay('2026-08-23')).getTime()).toBeLessThan(new Date(endOfLocalDay('2026-08-23')).getTime());
  });
});
