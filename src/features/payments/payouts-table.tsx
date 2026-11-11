'use client';
import { formatInTimeZone } from 'date-fns-tz';
import type { PayoutBatch, User } from '@goldstar/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { formatMoney } from '@/lib/format';
import type { PayoutRow } from './use-payouts';

const BATCH_STATUS_TONE: Record<PayoutBatch['status'], StatusTone> = {
  pending: 'info',
  completed: 'positive',
  partial: 'warning',
  failed: 'negative',
};

const ALLOCATION_STATUS_TONE: Record<PayoutRow['status'], StatusTone> = {
  pending: 'info',
  paid: 'positive',
  failed: 'negative',
};

export interface PayoutsTableProps {
  /** `payoutBatches` — always empty today (no writer anywhere in `functions/src`, grepped
   * directly; batching is Plan 8's job). Rendered honestly rather than assumed: a real batch, if
   * one is ever manually seeded or Plan 8 lands, shows up here with no dashboard code change. */
  batches: PayoutBatch[];
  batchesLoading: boolean;
  /** Whether the caller is entitled to see `payoutBatches` at all — `firestore.rules`' own read
   * rule is owner/admin/platform_admin only (no lead branch, unlike most of this page). */
  canViewBatches: boolean;
  payouts: PayoutRow[];
  payoutsLoading: boolean;
  staffByUid: Map<string, User>;
  /** Whether `payouts` reflects every staff member (owner/admin fan-out) or only the caller's own
   * rows (a lead, per `users/{uid}/payouts`'s rules — no lead branch there either). */
  isOwnPayoutsOnly: boolean;
}

function staffName(uid: string, staffByUid: Map<string, User>): string {
  return staffByUid.get(uid)?.displayName ?? uid;
}

/**
 * Payouts view (Task 6): `payoutBatches` (Plan 8 territory, currently always empty — rendered with
 * an explanatory empty state rather than hidden) plus the individual `users/{uid}/payouts` rows
 * `tipPool.ts` (Task 2) actually writes today (`{id: shiftId, shiftId, amount, currency, status:
 * 'pending', createdAt}` — no venue on the doc itself, so dates render in the browser's local time
 * rather than a venue timezone, same disclosed simplification as `payments-filters.tsx`'s date
 * range for a multi-venue aggregate view).
 */
export function PayoutsTable({ batches, batchesLoading, canViewBatches, payouts, payoutsLoading, staffByUid, isOwnPayoutsOnly }: PayoutsTableProps) {
  return (
    <div className="space-y-6">
      {canViewBatches && (
        <Card>
          <CardHeader>
            <CardTitle>Payout batches</CardTitle>
          </CardHeader>
          <CardContent>
            {batchesLoading ? (
              <Text size="sm" color="tertiary">
                Loading…
              </Text>
            ) : batches.length === 0 ? (
              <EmptyState title="No payout batches yet" description="Payout batching hasn't shipped yet — individual payout allocations below are still tracked per shift." />
            ) : (
              <div className="border-border overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead>Total tips</TableHead>
                      <TableHead>Allocations</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <Text size="sm">{b.period}</Text>
                        </TableCell>
                        <TableCell>
                          <Text size="sm">{formatMoney(b.totalTips, b.currency)}</Text>
                        </TableCell>
                        <TableCell>
                          <Text size="sm">{b.allocations.length}</Text>
                        </TableCell>
                        <TableCell>
                          <StatusPill label={b.status} tone={BATCH_STATUS_TONE[b.status]} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isOwnPayoutsOnly ? 'Your payouts' : 'Individual payouts'}</CardTitle>
        </CardHeader>
        <CardContent>
          {payoutsLoading ? (
            <Text size="sm" color="tertiary">
              Loading…
            </Text>
          ) : payouts.length === 0 ? (
            <EmptyState title="No payouts yet" description="Payouts are allocated when a shift with pooled tips closes." />
          ) : (
            <div className="border-border overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {!isOwnPayoutsOnly && <TableHead>Staff</TableHead>}
                    <TableHead>Shift</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((p) => (
                    <TableRow key={`${p.uid}-${p.id}`}>
                      {!isOwnPayoutsOnly && (
                        <TableCell>
                          <Text size="sm">{staffName(p.uid, staffByUid)}</Text>
                        </TableCell>
                      )}
                      <TableCell>
                        <Text size="sm">{p.shiftId ? p.shiftId.slice(0, 8) : '—'}</Text>
                      </TableCell>
                      <TableCell>
                        <Text size="sm">{formatMoney(p.amount, p.currency)}</Text>
                      </TableCell>
                      <TableCell>
                        <StatusPill label={p.status} tone={ALLOCATION_STATUS_TONE[p.status]} />
                      </TableCell>
                      <TableCell>
                        <Text size="sm" color="tertiary">
                          {formatInTimeZone(new Date(p.createdAt), Intl.DateTimeFormat().resolvedOptions().timeZone, 'MMM d, h:mm a')}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
