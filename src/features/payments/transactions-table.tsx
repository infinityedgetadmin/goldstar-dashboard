'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatInTimeZone } from 'date-fns-tz';
import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { Ticket, Transaction, Venue } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDoc } from '@/lib/firebase/hooks';
import { formatMoney } from '@/lib/format';
import { venueName, venueTimezone } from '@/features/tickets/ticket-format';
import { TX_STATUS_TONE } from '@/features/tickets/payment-panel';
import { RefundDialog } from '@/features/tickets/refund-dialog';

const STATUS_LABEL: Record<Transaction['status'], string> = {
  pending: 'Pending',
  authorized: 'Authorized',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
};

const METHOD_LABEL: Record<Transaction['method'], string> = {
  web: 'Web',
  in_app: 'In app',
  tap_to_pay: 'Tap to pay',
  reader: 'Reader',
  pms: 'PMS',
  pos: 'POS',
  invoice: 'Invoice',
};

/** Charge transactions in one of these two statuses have something left to refund — mirrors
 * `payment-panel.tsx`'s ticket-level `REFUNDABLE_PAYMENT_STATUSES` (`['paid','authorized']`), just
 * keyed to `Transaction['status']`'s own enum (`'succeeded'` where the ticket-level one uses
 * `'paid'`). Client-side convenience only, same as every other refund gate in this codebase —
 * `staffRefund`'s own `['paid','authorized'].includes(t.payment.status)` check on the fetched
 * ticket is the real (server-side) enforcement; this just avoids showing a dead-end button on an
 * obviously-unrefundable row from data already in hand (no extra fetch per row). */
function isRefundableRow(tx: Transaction): boolean {
  return tx.kind === 'charge' && (tx.status === 'succeeded' || tx.status === 'authorized');
}

function refundsSummary(tx: Transaction): string {
  if (tx.refunds.length === 0) return '—';
  const total = tx.refunds.reduce((sum, r) => sum + r.amount, 0);
  return `${tx.refunds.length} · ${formatMoney(total, tx.currency)}`;
}

/**
 * Shown (task-6-review.md M3) when a transaction's `ticketId` no longer resolves to a live ticket
 * doc — `tickets/archive.ts` moves `closed`/`cancelled` tickets to `operators/{op}/archive/` after
 * 90 days, but `transactions` is never archived alongside them, so `paymentsSearch` can legitimately
 * return a row whose ticket is gone from the live collection it fetches from. Before this fix, that
 * left the Refund button doing nothing at all once its loading spinner stopped — no dialog, no
 * message, no path forward. This is a fixed, already-safe, hardcoded message (not routed through
 * `sanitizeError`/`errorCopy`): there is no thrown `PlatformError` here to sanitize — `useDoc`
 * simply resolves `snap.exists() === false`, a plain absent-doc state, not an exception — so the
 * copy is written directly here, same as every other "not found" state in this codebase
 * (`ticket-detail.tsx`, `incident-detail.tsx`, `claim-detail.tsx` all do the same for their own
 * not-found states rather than routing a non-error through the error-sanitization pipeline).
 *
 * `staffRefund.ts` itself has the identical gap server-side (it reads only the live `tickets`
 * collection and throws `not_found` for an archived one) — refunding a >90-day-old transaction is
 * categorically not possible through this screen today. Noted as a Plan 8 ledger line in
 * task-6-report.md's Fix round 1 section: a real "refund an archived ticket" flow needs
 * `staffRefund` (or a new callable) to become archive-aware, which is out of this task's scope.
 */
function RefundUnavailableDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Refund unavailable</DialogTitle>
          <DialogDescription>Ticket archived — refunds for archived tickets aren&apos;t available yet.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export interface TransactionsTableProps {
  transactions: Transaction[];
  venues: Venue[];
  operatorId: string;
  loading: boolean;
  hasSearched: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Refund is admin+ only (owner/admin/platform_admin) — mirrors `payment-panel.tsx`'s own gate;
   * `staffRefund` itself also accepts a venue-scoped lead, but this button is intentionally
   * narrower, same disclosed choice as the ticket detail page's Refund button. */
  canRefund: boolean;
}

/**
 * Payments explorer results table (Task 6): date, ticket, method, base/tip/tax/total, status,
 * refunds, per the brief — column order matches that list. The Refund action REUSES
 * `tickets/refund-dialog.tsx` verbatim (task-6-brief.md's binding instruction) rather than a new
 * payments-scoped copy: it needs a full `Ticket` (for `payment.total`/`payment.currency`), which a
 * `paymentsSearch` result row doesn't carry (only `ticketId`) — clicking Refund fetches that ONE
 * ticket on demand via `useDoc` (a single hook call here, not one per row, so the row's own click
 * handler only sets which ticket id to fetch).
 */
export function TransactionsTable({ transactions, venues, operatorId, loading, hasSearched, hasMore, loadingMore, onLoadMore, canRefund }: TransactionsTableProps) {
  const [refundTicketId, setRefundTicketId] = useState<string | null>(null);
  const { data: refundTicket, loading: refundTicketLoading } = useDoc<Ticket>(refundTicketId ? `operators/${operatorId}/tickets/${refundTicketId}` : undefined);
  // M3 fix: the fetch resolved (not loading) with nothing found — an archived ticket, most likely.
  // Without this, the button's spinner just stops with no dialog and no explanation (task-6-review.md M3).
  const refundTicketMissing = refundTicketId !== null && !refundTicketLoading && !refundTicket;

  const columns = useMemo<ColumnDef<Transaction>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        cell: ({ row }) => {
          const t = row.original;
          const tz = venueTimezone(venues, t.venueId);
          return <Text size="sm">{formatInTimeZone(new Date(t.at), tz, 'MMM d, h:mm a')}</Text>;
        },
      },
      {
        id: 'venue',
        header: 'Venue',
        cell: ({ row }) => <Text size="sm">{venueName(venues, row.original.venueId)}</Text>,
      },
      {
        id: 'ticket',
        header: 'Ticket',
        cell: ({ row }) => (
          <Link href={`/tickets/${row.original.ticketId}`} className="text-body-sm font-medium text-text-primary hover:underline">
            {row.original.ticketId.slice(0, 8)}
          </Link>
        ),
      },
      { id: 'method', header: 'Method', cell: ({ row }) => <Text size="sm">{METHOD_LABEL[row.original.method]}</Text> },
      { id: 'base', header: 'Base', cell: ({ row }) => <Text size="sm">{formatMoney(row.original.base, row.original.currency)}</Text> },
      { id: 'tip', header: 'Tip', cell: ({ row }) => <Text size="sm">{formatMoney(row.original.tip, row.original.currency)}</Text> },
      { id: 'tax', header: 'Tax', cell: ({ row }) => <Text size="sm">{formatMoney(row.original.tax, row.original.currency)}</Text> },
      { id: 'total', header: 'Total', cell: ({ row }) => <Text size="sm" weight="medium">{formatMoney(row.original.total, row.original.currency)}</Text> },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={TX_STATUS_TONE[row.original.status]} />,
      },
      { id: 'refunds', header: 'Refunds', cell: ({ row }) => <Text size="sm">{refundsSummary(row.original)}</Text> },
    ],
    [venues],
  );

  const actionsColumn: ColumnDef<Transaction> = useMemo(
    () => ({
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        isRefundableRow(row.original) ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRefundTicketId(row.original.ticketId)}
            loading={refundTicketLoading && refundTicketId === row.original.ticketId}
          >
            Refund
          </Button>
        ) : null,
    }),
    [refundTicketLoading, refundTicketId],
  );
  const allColumns = useMemo(() => (canRefund ? [...columns, actionsColumn] : columns), [columns, actionsColumn, canRefund]);

  const table = useReactTable({ data: transactions, columns: allColumns, getCoreRowModel: getCoreRowModel() });

  if (!hasSearched) {
    return <EmptyState title="Search for transactions" description="Choose a date range (and any filters) above, then Search." />;
  }
  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Searching…
      </Text>
    );
  }
  if (transactions.length === 0) {
    return <EmptyState title="No transactions match" description="Try widening the date range or clearing a filter." />;
  }

  return (
    <div className="space-y-4">
      <div className="border-border overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={onLoadMore} loading={loadingMore}>
            Load more
          </Button>
        </div>
      )}
      {refundTicket && <RefundDialog ticket={refundTicket} onClose={() => setRefundTicketId(null)} />}
      {refundTicketMissing && <RefundUnavailableDialog onClose={() => setRefundTicketId(null)} />}
    </div>
  );
}
