import { describe, expect, it } from 'vitest';
import { isoWeekString } from '../iso-week';

describe('isoWeekString', () => {
  // Same ground-truth values verified independently for the server-side twin in
  // goldstar-platform's forecast.test.ts — must stay in lockstep with that implementation.
  it('matches known reference dates, including both year-boundary directions', () => {
    expect(isoWeekString('2026-08-23')).toBe('2026-W34');
    expect(isoWeekString('2026-01-01')).toBe('2026-W01');
    expect(isoWeekString('2025-12-29')).toBe('2026-W01');
    expect(isoWeekString('2026-12-31')).toBe('2026-W53');
  });
});
