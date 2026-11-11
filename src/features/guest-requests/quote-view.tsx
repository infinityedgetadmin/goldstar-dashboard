'use client';

import { useEffect, useState } from 'react';
import type { Quote } from '@goldstar/platform';
import { formatMoney } from '@/lib/public/format';
import { Text } from '@/components/ui/typography';

/**
 * Ticks a `remainingMs`/`expired` pair off `quote.expiresAt` (verified
 * against the installed `@goldstar/platform@0.3.5` `quoteSchema` —
 * `expiresAt` is `z.ZodOptional<z.ZodString>`; the task brief's own given
 * fixture omits it entirely, which this treats as "never expires" rather
 * than inventing a synthetic deadline). Cleans up its interval on unmount
 * and whenever `expiresAt` changes (a fresh quote resets the countdown).
 */
export function useQuoteExpiry(expiresAt: string | undefined) {
  const target = expiresAt ? Date.parse(expiresAt) : NaN;
  const hasDeadline = expiresAt !== undefined && !Number.isNaN(target);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!hasDeadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasDeadline, target]);

  if (!hasDeadline) return { expired: false, remainingMs: null as number | null };
  return { expired: now >= target, remainingMs: Math.max(0, target - now) };
}

function formatDistance(distanceMeters: number): string {
  const miles = distanceMeters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

function formatDuration(durationSec: number): string {
  const minutes = Math.round(durationSec / 60);
  return `${minutes} min`;
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export interface QuoteViewProps {
  quote: Quote;
  currency: string;
  remainingMs: number | null;
  expired: boolean;
  /**
   * Addendum round (Plan 5, v0.3.9 job-display block): the resume-quote path (a guest reloading
   * onto an existing 'quoted' job, via `linkedJobs`' switcher or the ghost-button/`resumeToken`
   * flow) has no destination visibly in view the way the FRESH request flow does — the guest just
   * typed it into `AddressAutocomplete` seconds ago there, but a resumed page shows neither that
   * input nor its selection. Optional so the fresh-request call sites (which don't strictly need
   * it) aren't forced to thread a destination string through local state just to pass one in.
   */
  destination?: string;
}

/**
 * Renders a quote's total, distance/duration, and line-item breakdown, plus
 * an expiry countdown when `quote.expiresAt` is present. Doesn't own the
 * "already expired" CTA itself (that's a step transition — re-requesting a
 * quote returns to the address/form step) — the parent sheet renders the
 * "Get a new quote" control and hides its own terms/Confirm block whenever
 * `expired` is true, using the same `expired` boolean this component
 * receives so both stay in lockstep off one source of truth
 * (`useQuoteExpiry`, called once by the parent sheet).
 */
export function QuoteView({ quote, currency, remainingMs, expired, destination }: QuoteViewProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-bg-primary p-4">
      {destination ? (
        <div>
          <Text size="xs" color="tertiary" className="uppercase tracking-wide">
            To
          </Text>
          <Text size="sm" weight="medium">
            {destination}
          </Text>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between">
        <Text weight="semibold" size="lg">
          Total
        </Text>
        <Text weight="semibold" size="lg">
          {formatMoney(quote.amount, currency)}
        </Text>
      </div>

      <div className="flex gap-4">
        <Text size="sm" color="secondary">
          {formatDistance(quote.distanceMeters)}
        </Text>
        <Text size="sm" color="secondary">
          {formatDuration(quote.durationSec)}
        </Text>
      </div>

      <dl className="flex flex-col gap-1 border-t border-border pt-3">
        {quote.breakdown.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <dt>
              <Text size="sm" color="secondary" as="span">
                {row.label}
              </Text>
            </dt>
            <dd>
              <Text size="sm" color="secondary" as="span">
                {formatMoney(row.amount, currency)}
              </Text>
            </dd>
          </div>
        ))}
      </dl>

      {expired ? (
        <Text color="error" role="status">
          This quote has expired.
        </Text>
      ) : remainingMs !== null ? (
        <Text
          size="sm"
          color={remainingMs < 60_000 ? 'error' : 'secondary'}
          className={remainingMs < 60_000 ? 'motion-safe:animate-pulse' : undefined}
        >
          Expires in {formatCountdown(remainingMs)}
        </Text>
      ) : null}
    </div>
  );
}
