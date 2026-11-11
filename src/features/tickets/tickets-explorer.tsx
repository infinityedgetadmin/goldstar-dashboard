'use client';
import { useMemo } from 'react';
import type { User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { toast } from '@/lib/toast';
import { TicketFilters } from './filters';
import { TicketsTable } from './tickets-table';
import { useTicketsSearch } from './use-tickets-search';
import { downloadCsv, ticketsToCsv } from './csv-export';

/**
 * Tickets explorer route content (Plan 4b Task 4). `'use client'` — `operatorId` only exists
 * client-side via `useSession()`, matching `live/page.tsx`/`staff-detail.tsx`.
 */
export function TicketsExplorer() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;
  const isManager = claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false;
  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staff, loading: staffLoading } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  const { tickets, loading, loadingMore, hasSearched, hasMore, search, loadMore } = useTicketsSearch();

  const exportCsv = () => {
    if (tickets.length === 0) {
      toast.info('No results to export yet.');
      return;
    }
    downloadCsv(ticketsToCsv(tickets, venues, staffByUid), `tickets-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!operatorId || venuesLoading || staffLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tickets" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Search every ticket across your venues."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={tickets.length === 0}>
            Export CSV
          </Button>
        }
      />
      <TicketFilters venues={venues} restrictToVenueIds={isManager ? undefined : claims?.venueIds} onSearch={search} />
      <TicketsTable
        tickets={tickets}
        venues={venues}
        staffByUid={staffByUid}
        loading={loading}
        hasSearched={hasSearched}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
