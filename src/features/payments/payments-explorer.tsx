'use client';
import { useMemo } from 'react';
import { orderBy, type QueryConstraint } from 'firebase/firestore';
import type { PayoutBatch, User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { toast } from '@/lib/toast';
import { PaymentsFilters } from './payments-filters';
import { TransactionsTable } from './transactions-table';
import { PayoutsTable } from './payouts-table';
import { ConnectStatusCard } from './connect-status-card';
import { useTransactionsSearch } from './use-transactions-search';
import { usePayouts } from './use-payouts';
import { downloadCsv, transactionsToCsv } from './csv-export';

const BATCHES_CONSTRAINTS: QueryConstraint[] = [orderBy('createdAt', 'desc')];

/**
 * Payments explorer route content (Plan 4b Task 6) — mirrors `tickets/tickets-explorer.tsx`'s
 * (Task 4) overall shape: a filters form driving a server-search callable, a results table with
 * CSV export, plus this task's own additions (payouts, Connect status).
 *
 * `isOwnerAdmin` mirrors `tickets-explorer.tsx`'s own `isManager` naming exactly (owner/admin only
 * — a `lead` reaching this page, which `nav.ts`/`(operator)/layout.tsx` both gate to
 * `MANAGER_ROLES`, still gets venue-scoped results from `paymentsSearch` itself, same as
 * `ticketsSearch`) — named `isOwnerAdmin` here instead to avoid confusion with the LAYOUT's own
 * broader "isManager = owner/admin/lead" gate that already got everyone onto this page.
 */
export function PaymentsExplorer() {
  const { claims, operator, uid } = useSession();
  const operatorId = claims?.operatorId;
  const isOwnerAdmin = claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false;

  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staff, loading: staffLoading } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  const { transactions, loading, loadingMore, hasSearched, hasMore, search, loadMore } = useTransactionsSearch();

  // Payouts fan-out targets: an owner/admin watches every staff member's own payouts subcollection
  // (rules-permitted — `isAdmin()`); a lead can only read their OWN (`request.auth.uid == uid`) —
  // see `use-payouts.ts`'s header comment for the full rules citation.
  const payoutUids = useMemo(() => (isOwnerAdmin ? staff.map((u) => u.uid) : uid ? [uid] : []), [isOwnerAdmin, staff, uid]);
  const { payouts, loading: payoutsLoading } = usePayouts(operatorId, payoutUids);
  const { data: batches, loading: batchesLoading } = useCollection<PayoutBatch>(
    operatorId && isOwnerAdmin ? `operators/${operatorId}/payoutBatches` : undefined,
    BATCHES_CONSTRAINTS,
  );

  const exportCsv = () => {
    if (transactions.length === 0) {
      toast.info('No results to export yet.');
      return;
    }
    downloadCsv(transactionsToCsv(transactions, venues), `payments-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!operatorId || !operator || venuesLoading || staffLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Search transactions, review payouts, and track your Stripe Connect status."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={transactions.length === 0}>
            Export CSV
          </Button>
        }
      />
      <ConnectStatusCard operator={operator} />
      <PaymentsFilters venues={venues} restrictToVenueIds={isOwnerAdmin ? undefined : claims?.venueIds} onSearch={search} />
      <TransactionsTable
        transactions={transactions}
        venues={venues}
        operatorId={operatorId}
        loading={loading}
        hasSearched={hasSearched}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
        canRefund={isOwnerAdmin}
      />
      <PayoutsTable
        batches={batches}
        batchesLoading={batchesLoading}
        canViewBatches={isOwnerAdmin}
        payouts={payouts}
        payoutsLoading={payoutsLoading}
        staffByUid={staffByUid}
        isOwnPayoutsOnly={!isOwnerAdmin}
      />
    </div>
  );
}
