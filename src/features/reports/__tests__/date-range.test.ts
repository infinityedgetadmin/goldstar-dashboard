import { describe, expect, it } from 'vitest';
import { addDays, matchingPresetKey, RANGE_PRESETS, rangeDayCount, todayInTz } from '../date-range';

const TZ = 'America/Indiana/Indianapolis';

describe('addDays', () => {
  it('does calendar arithmetic across month and year boundaries', () => {
    expect(addDays('2026-08-23', 1)).toBe('2026-08-24');
    expect(addDays('2026-08-23', -23)).toBe('2026-07-31');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('rangeDayCount', () => {
  it('is inclusive of both endpoints', () => {
    expect(rangeDayCount('2026-08-01', '2026-08-01')).toBe(1);
    expect(rangeDayCount('2026-08-01', '2026-08-07')).toBe(7);
  });
});

describe('RANGE_PRESETS', () => {
  it('"Last 7 days" spans exactly 7 days ending today', () => {
    const preset = RANGE_PRESETS.find((p) => p.key === '7d')!;
    const range = preset.range(TZ);
    expect(rangeDayCount(range.from, range.to)).toBe(7);
    expect(range.to).toBe(todayInTz(TZ));
  });
  it('"Today" is a single-day range', () => {
    const preset = RANGE_PRESETS.find((p) => p.key === 'today')!;
    const range = preset.range(TZ);
    expect(range.from).toBe(range.to);
  });
});

describe('matchingPresetKey', () => {
  it('finds the preset matching the current range, and undefined for a custom range', () => {
    const sevenDay = RANGE_PRESETS.find((p) => p.key === '7d')!.range(TZ);
    expect(matchingPresetKey(sevenDay, TZ)).toBe('7d');
    expect(matchingPresetKey({ from: '2020-01-01', to: '2020-01-05' }, TZ)).toBeUndefined();
  });
});
