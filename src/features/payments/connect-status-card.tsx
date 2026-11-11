'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Operator } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';

export interface ConnectStatusCardProps {
  operator: Operator;
}

type Status = { chargesEnabled: boolean; payoutsEnabled: boolean; requirementsDue: string[] } | 'loading' | 'error' | null;

/**
 * Stripe Connect status card for the payments page (Task 6) — a fuller sibling to
 * `settings/payments-settings.tsx`'s compact status pill (that one is Settings-page real estate;
 * this renders `requirementsDue` as a legible bulleted list, per the brief). Both call the same
 * `connectAccountStatus` callable, which now has a real Functions handler (this task fills the gap
 * those two files' own header comments describe as "not implemented yet" — that comment is now
 * stale on both, corrected alongside this card).
 *
 * The callable is only ever called once `connected` is already known true (from the operator doc
 * already in hand — no round trip needed to learn that) — a `failed_precondition` "not connected"
 * response is therefore never an EXPECTED outcome here (unlike `payments-settings.tsx`'s original
 * graceful-fallback catch, written before this callable existed at all); any error surfaced once
 * genuinely connected is a real failure worth showing, not silently swallowed.
 */
export function ConnectStatusCard({ operator }: ConnectStatusCardProps) {
  const connected = Boolean(operator.modules.payments.connectedAccountId);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    setStatus('loading');
    callable('connectAccountStatus')({})
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Stripe Connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected ? (
          <div className="space-y-2">
            <StatusPill label="Not connected" tone="neutral" />
            <Text size="sm" color="secondary">
              Connect Stripe from{' '}
              <Link href="/settings" className="font-medium text-text-primary hover:underline">
                Settings
              </Link>{' '}
              to accept payments and pay out staff.
            </Text>
          </div>
        ) : status === 'loading' || status === null ? (
          <Text size="sm" color="tertiary">
            Loading…
          </Text>
        ) : status === 'error' ? (
          <Text size="sm" color="secondary">
            Unable to load Connect status right now.
          </Text>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill label={status.chargesEnabled ? 'Charges enabled' : 'Charges disabled'} tone={status.chargesEnabled ? 'positive' : 'warning'} />
              <StatusPill label={status.payoutsEnabled ? 'Payouts enabled' : 'Payouts disabled'} tone={status.payoutsEnabled ? 'positive' : 'warning'} />
            </div>
            <Text size="xs" color="tertiary">
              Account {operator.modules.payments.connectedAccountId}
            </Text>
            {status.requirementsDue.length > 0 && (
              <div className="rounded-lg bg-bg-secondary p-3">
                <Text size="xs" weight="medium" color="secondary">
                  Stripe needs the following to keep this account fully enabled:
                </Text>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {status.requirementsDue.map((req) => (
                    <li key={req}>
                      <Text size="xs" color="secondary">
                        {req.replace(/_/g, ' ').replace(/\./g, ' · ')}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
