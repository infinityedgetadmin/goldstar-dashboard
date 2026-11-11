'use client';
import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import type { Shift } from '@goldstar/platform';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/typography';
import { addDaysString, formatDayLabel, formatVenueTime } from './time';

export interface ShiftsCalendarProps {
  /** `yyyy-MM-dd` — the first day of the visible week. */
  weekStart: string;
  timezone: string;
  shifts: Shift[];
  staffByUid: Map<string, { displayName: string }>;
  onSelectShift: (shift: Shift) => void;
  onCreateShift: (date: string) => void;
}

const STATUS_TONE: Record<Shift['status'], StatusTone> = { planned: 'neutral', open: 'positive', closed: 'info' };

/**
 * Week calendar: columns = days, rows = that day's shifts (Task 2 brief: "CSS grid is fine, no
 * calendar lib") — a 7-column CSS grid of day cards, each stacking its own shifts as a vertical
 * list, rather than a single grid with per-shift `grid-column` placement; simpler to reason about
 * and just as correct for "columns are days, rows are shifts within a day."
 */
export function ShiftsCalendar({ weekStart, timezone, shifts, staffByUid, onSelectShift, onCreateShift }: ShiftsCalendarProps) {
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysString(weekStart, i)), [weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const day of days) map.set(day, []);
    for (const s of shifts) {
      const arr = map.get(s.date);
      if (arr) arr.push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return map;
  }, [days, shifts]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const dayShifts = byDay.get(day) ?? [];
        return (
          <div key={day} className="space-y-2">
            <div className="flex items-center justify-between">
              <Text size="xs" weight="semibold" color="secondary">
                {formatDayLabel(day)}
              </Text>
              <button
                type="button"
                aria-label={`Add shift on ${day}`}
                onClick={() => onCreateShift(day)}
                className="flex h-11 w-11 items-center justify-center rounded-md text-text-tertiary hover:bg-bg-secondary hover:text-text-primary"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="min-h-16 space-y-2">
              {dayShifts.length === 0 ? (
                <Text size="xs" color="tertiary">
                  No shifts
                </Text>
              ) : (
                dayShifts.map((shift) => (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => onSelectShift(shift)}
                    className="block w-full rounded-lg border border-border bg-bg-primary p-3 text-left transition-colors hover:border-primary-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Text size="xs" weight="medium">
                        {formatVenueTime(shift.startsAt, timezone)}–{formatVenueTime(shift.endsAt, timezone)}
                      </Text>
                      <StatusPill label={shift.status} tone={STATUS_TONE[shift.status]} />
                    </div>
                    {shift.source.provider !== 'internal' && (
                      <Badge size="sm" variant="info" className="mt-1">
                        Synced
                      </Badge>
                    )}
                    <Text size="xs" color="tertiary" className="mt-1">
                      {shift.assignedUids.length === 0
                        ? 'Unassigned'
                        : shift.assignedUids.map((uid) => staffByUid.get(uid)?.displayName ?? uid).join(', ')}
                    </Text>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
