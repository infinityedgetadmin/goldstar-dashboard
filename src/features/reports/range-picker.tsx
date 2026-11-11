'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import { addDays, MAX_CUSTOM_RANGE_DAYS, matchingPresetKey, RANGE_PRESETS, rangeDayCount, type DateRange } from './date-range';

export interface RangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  timezone: string;
}

/**
 * Preset buttons (Today / 7d / 30d / 90d) + a "Custom" toggle revealing two date inputs, bounded to
 * `MAX_CUSTOM_RANGE_DAYS` (366) — matches (with headroom) the `analyticsSummary` callable's own
 * server-side `MAX_RANGE_DAYS` (400) so a range this picker allows never comes back rejected.
 * 44px touch targets throughout (buttons/inputs use this workspace's existing components, which
 * already enforce that).
 */
export function RangePicker({ value, onChange, timezone }: RangePickerProps) {
  const activePreset = matchingPresetKey(value, timezone);
  const [customOpen, setCustomOpen] = useState(activePreset === undefined);
  const [customError, setCustomError] = useState<string>();

  const applyCustom = (from: string, to: string) => {
    if (!from || !to) return;
    if (from > to) {
      setCustomError('End date must be on or after the start date.');
      return;
    }
    if (rangeDayCount(from, to) > MAX_CUSTOM_RANGE_DAYS) {
      setCustomError(`Range can't exceed ${MAX_CUSTOM_RANGE_DAYS} days.`);
      return;
    }
    setCustomError(undefined);
    onChange({ from, to });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Report date range">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            variant={activePreset === preset.key && !customOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setCustomOpen(false);
              onChange(preset.range(timezone));
            }}
          >
            {preset.label}
          </Button>
        ))}
        <Button type="button" variant={customOpen ? 'primary' : 'secondary'} size="sm" onClick={() => setCustomOpen((v) => !v)}>
          Custom
        </Button>
      </div>
      {customOpen && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <Text size="xs" color="tertiary">
              From
            </Text>
            <Input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) => applyCustom(e.target.value, value.to)}
              aria-label="Range start date"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text size="xs" color="tertiary">
              To
            </Text>
            <Input
              type="date"
              value={value.to}
              min={value.from}
              max={addDays(value.from, MAX_CUSTOM_RANGE_DAYS - 1)}
              onChange={(e) => applyCustom(value.from, e.target.value)}
              aria-label="Range end date"
            />
          </label>
          {customError && (
            <Text size="sm" className={cn('text-error-600')}>
              {customError}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
