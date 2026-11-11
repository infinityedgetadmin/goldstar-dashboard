'use client';
import { useMemo } from 'react';
import { orderBy, where, type QueryConstraint } from 'firebase/firestore';
import type { ColumnDef } from '@tanstack/react-table';
import { Receipt } from 'lucide-react';
import type { Invoice } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { formatDate, formatMoney } from '@/lib/format';
import { useVenue } from './venue-context';

const STATUS_LABEL: Record<Invoice['status'], string> = { draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void' };
const STATUS_TONE: Record<Invoice['status'], StatusTone> = { draft: 'neutral', sent: 'info', paid: 'positive', void: 'negative' };

/**
 * Venue invoices list (Plan 7 Task 1b): what this venue has been billed, newest period first.
 *
 * Query is the registered `invoicesByVenue` `QUERIES` shape exactly (`venueId ==` +
 * `orderBy period`; equality + single orderBy runs the composite index in reverse for `desc`),
 * venue-scoped from `useVenue()` and provable against `firestore.rules`' venue_user `invoices`
 * read branch.
 *
 * No PDF download: `invoice.pdfPath` points at Storage, and `storage.rules` has no path a
 * venue_user may read (exports are admin-only; nothing matches invoice PDFs at all) — a download
 * link here would 403 for every host. Needs either a storage-rules addition or a signed-URL
 * callable; flagged in task-1b-report.md, not silently faked.
 */
export function VenueInvoices() {
  const session = useSession();
  const { venue } = useVenue();
  const operatorId = session.claims?.operatorId;

  // N3 (T1b re-review): `[venue]` here is a CORRECTNESS dependency on Ruling G, not just a
  // memo nicety. `useCollection` resets during the render whose constraints IDENTITY changed —
  // so if `venue`'s identity ever churned per snapshot again (the pre-Ruling-G behavior in
  // use-claim-venues.ts), this memo would mint fresh constraints every emission and the hook
  // would reset+resubscribe in a loop. See the matching note on use-claim-venues.ts's
  // identity-preserving publish before "simplifying" either side.
  const constraints = useMemo<QueryConstraint[]>(
    () => (venue ? [where('venueId', '==', venue.id), orderBy('period', 'desc')] : []),
    [venue]
  );
  const { data, loading, error } = useCollection<Invoice>(
    operatorId && venue ? `operators/${operatorId}/invoices` : undefined,
    constraints
  );

  const columns = useMemo<ColumnDef<Invoice>[]>(
    () => [
      {
        id: 'period',
        header: 'Period',
        accessorFn: (i) => i.period,
        cell: ({ row }) => (
          <Text as="span" size="sm" weight="medium">
            {row.original.period}
          </Text>
        ),
      },
      {
        id: 'total',
        header: 'Total',
        accessorFn: (i) => i.total,
        cell: ({ row }) => <Text as="span" size="sm">{formatMoney(row.original.total, row.original.currency)}</Text>,
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (i) => STATUS_LABEL[i.status],
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: 'sent',
        header: 'Sent on',
        accessorFn: (i) => i.sentAt ?? '',
        cell: ({ row }) => (
          <Text as="span" size="sm" color="secondary">
            {row.original.sentAt ? formatDate(row.original.sentAt) : '—'}
          </Text>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description={venue ? `${venue.name} — what your venue has been billed.` : 'What your venue has been billed.'}
      />
      {error ? (
        <EmptyState icon={<Receipt />} title="Something went wrong" description="We couldn't load invoices. Check your connection and try again." />
      ) : loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : data.length === 0 ? (
        <EmptyState icon={<Receipt />} title="No invoices yet" description="Monthly valet invoices for this venue will appear here." />
      ) : (
        <DataTable columns={columns} data={data} showColumnVisibility={false} showPagination={data.length > 12} pageSize={12} searchPlaceholder="Filter by period…" />
      )}
    </div>
  );
}
