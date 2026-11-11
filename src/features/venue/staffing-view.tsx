'use client';
import { useMemo } from 'react';
import { limit, orderBy, where, type QueryConstraint } from 'firebase/firestore';
import { Clock } from 'lucide-react';
import type { Shift } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import type { ColumnDef } from '@tanstack/react-table';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { formatDate } from '@/lib/format';
import { todayLocal } from '@/lib/local-date-range';
import { useVenue } from './venue-context';

const UPCOMING_LIMIT = 20;
const STATUS_TONE: Record<Shift['status'], StatusTone> = { planned: 'info', open: 'positive', closed: 'neutral' };
const STATUS_LABEL: Record<Shift['status'], string> = { planned: 'Planned', open: 'Open', closed: 'Closed' };

const timeFormat = new Intl.DateTimeFormat('en-US', { timeStyle: 'short' });

/**
 * "1 lead · 3 attendants"-style coverage summary from a shift's assignments. Exported for its
 * own unit test.
 */
export function coverageSummary(assignments: Shift['assignments']): string {
  if (assignments.length === 0) return 'No one assigned yet';
  const byRole = new Map<string, number>();
  for (const a of assignments) byRole.set(a.role, (byRole.get(a.role) ?? 0) + 1);
  return [...byRole.entries()].map(([role, n]) => `${n} ${role}${n === 1 ? '' : 's'}`).join(' · ');
}

/**
 * Staffing view (Plan 7 Task 1b): upcoming shifts at the selected venue — date, hours, coverage
 * and confirmation state.
 *
 * Query is the registered `venueShifts` `QUERIES` shape (`[venueId, date]`): `venueId ==` +
 * `date >= today` + `orderBy date asc`, venue-scoped from `useVenue()` and provable against
 * `firestore.rules`' shifts list branch (`resource.data.venueId in venueIds()`).
 *
 * The brief says "names only" — but a shift's `assignments` carry only `uid`s, and a venue_user
 * has NO rules path to `operators/{op}/users/{uid}` (get requires manager-or-self), so staff
 * names are unreadable for this role by design. Shown instead: per-role coverage counts and how
 * many are confirmed. Surfacing names needs a platform change (denormalized display names on
 * assignments, or a venue-scoped callable) — flagged in task-1b-report.md, per Ruling B, rather
 * than worked around.
 */
export function StaffingView() {
  const session = useSession();
  const { venue } = useVenue();
  const operatorId = session.claims?.operatorId;
  const today = todayLocal();

  // N3 (T1b re-review): `[venue]` here is a CORRECTNESS dependency on Ruling G, not just a
  // memo nicety. `useCollection` resets during the render whose constraints IDENTITY changed —
  // so if `venue`'s identity ever churned per snapshot again (the pre-Ruling-G behavior in
  // use-claim-venues.ts), this memo would mint fresh constraints every emission and the hook
  // would reset+resubscribe in a loop. See the matching note on use-claim-venues.ts's
  // identity-preserving publish before "simplifying" either side.
  const constraints = useMemo<QueryConstraint[]>(
    () => (venue ? [where('venueId', '==', venue.id), where('date', '>=', today), orderBy('date', 'asc'), limit(UPCOMING_LIMIT)] : []),
    [venue, today]
  );
  const { data, loading, error } = useCollection<Shift>(
    operatorId && venue ? `operators/${operatorId}/shifts` : undefined,
    constraints
  );

  const columns = useMemo<ColumnDef<Shift>[]>(
    () => [
      {
        id: 'date',
        header: 'Date',
        accessorFn: (s) => s.date,
        cell: ({ row }) => (
          <Text as="span" size="sm" weight="medium">
            {formatDate(`${row.original.date}T00:00:00`)}
          </Text>
        ),
      },
      {
        id: 'hours',
        header: 'Hours',
        accessorFn: (s) => s.startsAt,
        cell: ({ row }) => (
          <Text as="span" size="sm" color="secondary">
            {timeFormat.format(new Date(row.original.startsAt))} – {timeFormat.format(new Date(row.original.endsAt))}
          </Text>
        ),
      },
      {
        id: 'coverage',
        header: 'Coverage',
        enableSorting: false,
        cell: ({ row }) => {
          const assignments = row.original.assignments;
          const confirmed = assignments.filter((a) => a.confirmed).length;
          return (
            <div>
              <Text size="sm">{coverageSummary(assignments)}</Text>
              {assignments.length > 0 ? (
                <Text size="xs" color="tertiary">
                  {confirmed}/{assignments.length} confirmed
                </Text>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessorFn: (s) => STATUS_LABEL[s.status],
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />,
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staffing"
        description={venue ? `${venue.name} — who is covering the stand.` : 'Who is covering the stand.'}
      />
      {error ? (
        <EmptyState icon={<Clock />} title="Something went wrong" description="We couldn't load shifts. Check your connection and try again." />
      ) : loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : data.length === 0 ? (
        <EmptyState icon={<Clock />} title="No upcoming shifts" description="Shifts your valet operator schedules at this venue will appear here." />
      ) : (
        <DataTable columns={columns} data={data} showColumnVisibility={false} showPagination={false} pageSize={UPCOMING_LIMIT} searchPlaceholder="Filter…" />
      )}
    </div>
  );
}
