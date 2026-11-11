'use client';
import { useState } from 'react';
import { formatInTimeZone } from 'date-fns-tz';
import type { Ticket, Transaction } from '@goldstar/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { Button } from '@/components/ui/buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/format';
import { RefundDialog } from './refund-dialog';

/** Exported for reuse by `src/features/payments/transactions-table.tsx` (Task 6) — DRY, one tone
 * mapping for a transaction's `status` across both the ticket detail page and the payments
 * explorer, rather than a second copy. */
export const TX_STATUS_TONE: Record<Transaction['status'], StatusTone> = {
  pending: 'info',
  authorized: 'info',
  succeeded: 'positive',
  failed: 'negative',
  refunded: 'neutral',
};

const REFUNDABLE_PAYMENT_STATUSES: readonly NonNullable<Ticket['payment']>['status'][] = ['paid', 'authorized'];

export interface PaymentPanelProps {
  ticket: Ticket;
  transactions: Transaction[];
  timezone: string;
  /** Refund is admin+ only (owner/admin/platform_admin) — mirrors `staffRefund`'s own server-side
   * role gate (owner/admin/lead actually, but the brief specifies "Refund (admin, amount +
   * reason)" for the detail page's button specifically; the callable itself also accepts a lead at
   * the ticket's venue — this button is intentionally narrower than what the callable allows). */
  canRefund: boolean;
}

/** Payment summary + transaction history + the admin Refund action. */
export function PaymentPanel({ ticket, transactions, timezone, canRefund }: PaymentPanelProps) {
  const [refundOpen, setRefundOpen] = useState(false);
  const payment = ticket.payment;
  const currency = payment?.currency ?? 'USD';
  const refundable = canRefund && !!payment && REFUNDABLE_PAYMENT_STATUSES.includes(payment.status);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Payment</CardTitle>
        {refundable && (
          <Button size="sm" variant="danger" onClick={() => setRefundOpen(true)}>
            Refund
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {payment ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Text size="xs" color="tertiary">
                Total
              </Text>
              <Text size="sm" weight="medium">
                {formatMoney(payment.total, currency)}
              </Text>
            </div>
            <div>
              <Text size="xs" color="tertiary">
                Tip
              </Text>
              <Text size="sm" weight="medium">
                {formatMoney(payment.tip, currency)}
              </Text>
            </div>
            <div>
              <Text size="xs" color="tertiary">
                Status
              </Text>
              <Text size="sm" weight="medium">
                {payment.status}
              </Text>
            </div>
            <div>
              <Text size="xs" color="tertiary">
                Method
              </Text>
              <Text size="sm" weight="medium">
                {payment.method ?? '—'}
              </Text>
            </div>
          </div>
        ) : (
          <Text size="sm" color="tertiary">
            No payment on this ticket.
          </Text>
        )}

        {transactions.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          <ul className="divide-border divide-y">
            {transactions.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between py-2">
                <div>
                  <Text size="sm" weight="medium" className="capitalize">
                    {tx.kind.replace(/_/g, ' ')}
                  </Text>
                  <Text size="xs" color="tertiary">
                    {formatInTimeZone(new Date(tx.at), timezone, 'MMM d, h:mm a')} · {tx.provider}
                  </Text>
                </div>
                <div className="flex items-center gap-2">
                  <Text size="sm">{formatMoney(tx.total, tx.currency)}</Text>
                  <StatusPill label={tx.status} tone={TX_STATUS_TONE[tx.status]} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {refundOpen && <RefundDialog ticket={ticket} onClose={() => setRefundOpen(false)} />}
    </Card>
  );
}
