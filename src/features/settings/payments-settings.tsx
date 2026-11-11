'use client';
import { useEffect, useState } from 'react';
import type { Operator } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';

export interface PaymentsSettingsProps {
  operator: Operator;
}

interface ConnectStatus {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  requirementsDue: string[];
}

/**
 * `connectAccountStatus` now has a real Functions handler (Plan 4b Task 6, `goldstar-platform`
 * `functions/src/modules/payments/connectAccountStatus.ts`) — this call, written in Task 4 before
 * that handler existed, upgraded automatically with no dashboard change needed, exactly as this
 * comment originally predicted. The `.catch()` below is kept as a real error fallback (a genuine
 * Stripe/network failure), not a "not implemented yet" placeholder anymore.
 */
export function PaymentsSettings({ operator }: PaymentsSettingsProps) {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const connected = Boolean(operator.modules.payments.connectedAccountId);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    callable('connectAccountStatus')({})
      .then((res) => {
        if (!cancelled) setStatus(res);
      })
      .catch(() => {
        // A genuine failure (network/Stripe) — the presence-only status below still renders correctly.
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { url } = await callable('connectOnboardingLink')({ kind: 'operator' });
      window.location.href = url;
    } catch (err) {
      toast.error(err);
      setConnecting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Text size="sm" weight="medium">
              Stripe Connect
            </Text>
            <Text size="xs" color="tertiary">
              {connected ? `Account ${operator.modules.payments.connectedAccountId}` : 'Not connected yet'}
            </Text>
          </div>
          {connected ? (
            <StatusPill
              label={status?.chargesEnabled ? 'Charges enabled' : 'Connected'}
              tone={status?.chargesEnabled ? 'positive' : 'warning'}
            />
          ) : (
            <StatusPill label="Not connected" tone="neutral" />
          )}
        </div>

        {status && !status.chargesEnabled && status.requirementsDue.length > 0 && (
          <div className="rounded-lg bg-bg-secondary p-3">
            <Text size="xs" color="secondary">
              Stripe needs: {status.requirementsDue.join(', ')}
            </Text>
          </div>
        )}

        <Button type="button" onClick={handleConnect} loading={connecting}>
          {connected ? 'Update Stripe connection' : 'Connect with Stripe'}
        </Button>
      </CardContent>
    </Card>
  );
}
