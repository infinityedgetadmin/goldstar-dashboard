'use client';
import { useMemo, useState } from 'react';
import { where, type QueryConstraint } from 'firebase/firestore';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgePercent } from 'lucide-react';
import type { Validation } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { formatDateTime, formatMoney } from '@/lib/format';
import { endOfLocalDay, startOfLocalDay, todayLocal } from '@/lib/local-date-range';
import { useVenue } from './venue-context';
import { IssueValidationDialog } from './issue-validation-dialog';
import { ApplyToCheckDialog } from './apply-to-check-dialog';

const TYPE_LABEL: Record<Validation['type'], string> = { full: 'Full', partial: 'Partial', comp: 'Comp', rate: 'Alternate rate' };

/** Redemption/expiry state for the status column — exported for its own unit test. */
export function validationState(v: Validation, nowIso: string): { label: string; tone: StatusTone } {
  if (v.redeemedTicketId) return { label: 'Redeemed', tone: 'positive' };
  if (v.expiresAt && v.expiresAt < nowIso) return { label: 'Expired', tone: 'neutral' };
  return { label: 'Open', tone: 'info' };
}

/**
 * Validations panel (Plan 7 Task 1b): the venue's issued validations (code, type, amount, when,
 * redemption state) with daily totals and the issue dialog.
 *
 * Query scoping: a single `where('venueId', '==', <claimed venue>)` equality — venue-scoped from
 * `useVenue()` (the claim-derived context) and provable against `firestore.rules`' venue_user
 * `validations` read branch. Deliberately NO `orderBy`: the only registered `QUERIES` shape for
 * `validations` is `validationsByCode` (`[venueId, code]`) — a `venueId + issuedAt` composite is
 * unregistered and therefore unindexed, and the emulator would not catch that (the
 * `guestTicketsByUidOrdered` lesson). A lone equality filter needs no composite index at
 * collection scope; ordering is done client-side. Flagged in task-1b-report.md: at scale this
 * wants a registered `validationsByVenue` `[venueId, issuedAt desc]` entry + `limit`, a platform
 * change this task must not make (Ruling B).
 *
 * `issuedBy` is a staff/host uid — a venue_user has no rules path to `operators/{op}/users`, so
 * names can't be resolved here; the column shows "You" for the caller's own and omits others
 * (disclosed in task-1b-report.md).
 */
export function ValidationsPanel() {
  const session = useSession();
  const { venue } = useVenue();
  const operatorId = session.claims?.operatorId;
  const currency = session.operator?.currency ?? 'USD';

  // N3 (T1b re-review): `[venue]` here is a CORRECTNESS dependency on Ruling G, not just a
  // memo nicety. `useCollection` resets during the render whose constraints IDENTITY changed —
  // so if `venue`'s identity ever churned per snapshot again (the pre-Ruling-G behavior in
  // use-claim-venues.ts), this memo would mint fresh constraints every emission and the hook
  // would reset+resubscribe in a loop. See the matching note on use-claim-venues.ts's
  // identity-preserving publish before "simplifying" either side.
  const constraints = useMemo<QueryConstraint[]>(() => (venue ? [where('venueId', '==', venue.id)] : []), [venue]);
  const { data, loading, error } = useCollection<Validation>(
    operatorId && venue ? `operators/${operatorId}/validations` : undefined,
    constraints
  );

  const validations = useMemo(() => [...data].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)), [data]);

  const today = todayLocal();
  const todays = useMemo(() => {
    const from = startOfLocalDay(today);
    const to = endOfLocalDay(today);
    return validations.filter((v) => v.issuedAt >= from && v.issuedAt <= to);
  }, [validations, today]);
  const todayValue = todays.reduce((sum, v) => sum + (v.amount ?? 0), 0);
  const todayRedeemed = todays.filter((v) => v.redeemedTicketId).length;

  const [issuing, setIssuing] = useState(false);
  // Contracts v0.4.1 unblocked T1b's flagged gap: an issued validation can now be pushed to an open
  // POS check. Offered only when the venue actually HAS a POS configured — without `venue.pos` the
  // callable has no restaurant to talk to, and an action that can only fail is worse than no action.
  const posConfigured = Boolean(venue?.pos);
  const [applyTo, setApplyTo] = useState<Validation | null>(null);

  const columns = useMemo<ColumnDef<Validation>[]>(
    () => [
      {
        id: 'code',
        header: 'Code',
        accessorFn: (v) => v.code,
        cell: ({ row }) => (
          <Text as="span" size="sm" weight="semibold" className="font-mono tracking-wider">
            {row.original.code}
          </Text>
        ),
      },
      { id: 'type', header: 'Type', accessorFn: (v) => TYPE_LABEL[v.type] },
      {
        id: 'amount',
        header: 'Amount',
        accessorFn: (v) => v.amount ?? -1,
        cell: ({ row }) => (
          <Text as="span" size="sm">
            {row.original.amount !== undefined ? formatMoney(row.original.amount, currency) : '—'}
          </Text>
        ),
      },
      {
        id: 'issued',
        header: 'Issued',
        accessorFn: (v) => v.issuedAt,
        cell: ({ row }) => (
          <div>
            <Text size="sm">{formatDateTime(row.original.issuedAt)}</Text>
            {row.original.issuedBy === session.uid ? (
              <Text size="xs" color="tertiary">
                by you
              </Text>
            ) : null}
          </div>
        ),
      },
      {
        id: 'state',
        header: 'Status',
        accessorFn: (v) => validationState(v, new Date().toISOString()).label,
        cell: ({ row }) => {
          const s = validationState(row.original, new Date().toISOString());
          return <StatusPill label={s.label} tone={s.tone} />;
        },
      },
      // Only rendered for a POS venue, and only on a validation that is still redeemable. A
      // redeemed code is terminal (Ruling F) — offering "Apply to check" on one would advertise an
      // action guaranteed to fail. Expiry is checked through the same `validationState` the Status
      // column shows, so the button and the pill can never disagree.
      ...(posConfigured
        ? [
            {
              id: 'apply',
              header: '',
              enableSorting: false,
              cell: ({ row }: { row: { original: Validation } }) =>
                validationState(row.original, new Date().toISOString()).label === 'Open' ? (
                  <Button variant="secondary" size="sm" onClick={() => setApplyTo(row.original)}>
                    Apply to check
                  </Button>
                ) : null,
            } satisfies ColumnDef<Validation>,
          ]
        : []),
    ],
    // `setApplyTo` is a stable setState identity, but the React Compiler requires every
    // referenced value to be declared rather than inferred — listing it costs no extra recomputes.
    [currency, session.uid, posConfigured, setApplyTo]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validations"
        description={venue ? `${venue.name} — parking validations issued for your guests.` : 'Parking validations issued for your guests.'}
        actions={
          <Button onClick={() => setIssuing(true)} disabled={!venue}>
            Issue validation
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Issued today" value={todays.length} />
        {/* T1b fix round, MINOR-1: labeled for what it actually sums — only partial validations
            carry an amount at issue time (full/comp/rate amounts are computed at redemption), so
            calling this "Value today" made the headline number quietly exclude most types. */}
        <StatTile label="Partial value today" value={formatMoney(todayValue, currency)} subtitle="Full, comp and rate amounts are set at redemption" />
        <StatTile label="Redeemed today" value={todayRedeemed} />
      </div>

      {error ? (
        <EmptyState icon={<BadgePercent />} title="Something went wrong" description="We couldn't load validations. Check your connection and try again." />
      ) : loading ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : validations.length === 0 ? (
        <EmptyState icon={<BadgePercent />} title="No validations yet" description="Issue one and hand the guest the code — redemptions show up here." />
      ) : (
        <DataTable columns={columns} data={validations} searchPlaceholder="Filter by code…" showColumnVisibility={false} pageSize={25} />
      )}

      {issuing && venue ? <IssueValidationDialog venue={venue} currency={currency} onClose={() => setIssuing(false)} /> : null}
      {applyTo && venue ? (
        <ApplyToCheckDialog
          venue={venue}
          validation={applyTo}
          currency={currency}
          onClose={() => setApplyTo(null)}
          onApplied={() => setApplyTo(null)}
        />
      ) : null}
    </div>
  );
}
