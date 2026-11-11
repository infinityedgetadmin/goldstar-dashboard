'use client';
import { useEffect, useState } from 'react';
import { Text } from '@/components/ui/typography';

/** goldstar-mobile's `src/features/queue/components/sla-timer.tsx` thresholds, kept identical so
 * a wait time reads the same urgency on the dashboard as it does on a staff member's phone: under
 * 4 minutes is neutral, 4-7 is a warning, 7+ is over. */
const WARN_MINUTES = 4;
const OVER_MINUTES = 7;

export type SlaLevel = 'ok' | 'warn' | 'over';

export const slaLevel = (minutes: number): SlaLevel => (minutes >= OVER_MINUTES ? 'over' : minutes >= WARN_MINUTES ? 'warn' : 'ok');

// `Text`'s `color` prop has no `'warning'` option (only primary/secondary/tertiary/inverse/
// inherit/success/error) — a plain Tailwind class is used directly for the warn level instead of
// fighting that prop for a tone it doesn't expose.
const LEVEL_CLASS: Record<SlaLevel, string> = { over: 'text-error-700', warn: 'text-warning-700', ok: 'text-text-secondary' };

/** Live "Nm waiting" readout since `since` (a ticket's `times.requestedAt`), colored by
 * `slaLevel`. Ticks every 15s — same cadence as the mobile `SlaTimer`, coarse enough that a
 * per-second re-render isn't worth it for a value that only changes once a minute. */
export function SlaTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(i);
  }, []);

  const minutes = Math.floor((now - Date.parse(since)) / 60_000);
  const level = slaLevel(minutes);

  return (
    <Text
      data-testid="sla-timer"
      aria-label={`${minutes} minutes waiting, ${level}`}
      as="span"
      size="sm"
      weight="semibold"
      className={LEVEL_CLASS[level]}
    >
      {minutes}m waiting
    </Text>
  );
}
