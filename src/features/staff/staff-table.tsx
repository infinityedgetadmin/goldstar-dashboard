'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { ROLES, type Role, type User, type Venue } from '@goldstar/platform';
import { DataTable } from '@/components/ui/data-table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/forms/Select';
import { Text } from '@/components/ui/typography';
import { useCollection } from '@/lib/firebase/hooks';
import { EligibilityBadge } from './eligibility-badge';

export interface StaffTableProps {
  operatorId: string;
  venues: Venue[];
}

const STATUS_TONE: Record<User['status'], StatusTone> = { invited: 'info', active: 'positive', suspended: 'negative' };

const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform admin', owner: 'Owner', admin: 'Admin', lead: 'Lead', attendant: 'Attendant', driver: 'Driver', venue_user: 'Venue user', guest: 'Guest',
};

const ROLE_FILTER_OPTIONS = [{ value: '', label: 'All roles' }, ...ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'invited', label: 'Invited' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

function venueNames(venueIds: string[], venueById: Map<string, string>): string {
  if (venueIds.length === 0) return '—';
  return venueIds.map((id) => venueById.get(id) ?? id).join(', ');
}

/**
 * Live staff list (`onSnapshot`-only, per this workspace's ledger constraint). Role/venue/status
 * filters run client-side against the already-subscribed `operators/{op}/users` collection (same
 * "small operator-scoped collection, filter in memory" approach as `key-tags-panel.tsx`'s status
 * counts) — `DataTable`'s own search box stays wired to name/email substring search via its built-in
 * `fuzzyFilter`, same as `venues-table.tsx`.
 */
export function StaffTable({ operatorId, venues }: StaffTableProps) {
  const { data, loading, error } = useCollection<User>(`operators/${operatorId}/users`);
  const [roleFilter, setRoleFilter] = useState('');
  const [venueFilter, setVenueFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const venueById = useMemo(() => new Map(venues.map((v) => [v.id, v.name])), [venues]);
  const venueFilterOptions = useMemo(() => [{ value: '', label: 'All venues' }, ...venues.map((v) => ({ value: v.id, label: v.name }))], [venues]);

  const filtered = useMemo(
    () =>
      data.filter(
        (u) =>
          (!roleFilter || u.roles.includes(roleFilter as Role)) &&
          (!venueFilter || u.venueIds.includes(venueFilter)) &&
          (!statusFilter || u.status === statusFilter),
      ),
    [data, roleFilter, venueFilter, statusFilter],
  );

  const columns: ColumnDef<User>[] = useMemo(
    () => [
      {
        accessorKey: 'displayName',
        header: 'Name',
        cell: ({ row }) => (
          <Link href={`/staff/${row.original.uid}`} className="text-body-sm font-medium text-text-primary hover:underline">
            {row.original.displayName}
          </Link>
        ),
      },
      { accessorKey: 'email', header: 'Email', cell: ({ row }) => <Text size="sm">{row.original.email}</Text> },
      {
        id: 'roles',
        header: 'Roles',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} size="sm">
                {ROLE_LABELS[r]}
              </Badge>
            ))}
          </div>
        ),
      },
      { id: 'venues', header: 'Venues', cell: ({ row }) => <Text size="sm">{venueNames(row.original.venueIds, venueById)}</Text> },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: 'eligibility',
        header: 'Eligibility',
        cell: ({ row }) => <EligibilityBadge eligibility={row.original.eligibility} />,
      },
      {
        id: 'lastSeen',
        header: 'Last seen',
        cell: ({ row }) =>
          row.original.lastSeenAt ? (
            <Text size="sm" color="tertiary">
              {formatDistanceToNow(new Date(row.original.lastSeenAt), { addSuffix: true })}
            </Text>
          ) : (
            <Text size="sm" color="tertiary">
              Never
            </Text>
          ),
      },
    ],
    [venueById],
  );

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading staff…
      </Text>
    );
  }

  if (error) {
    return <EmptyState title="Couldn't load staff" description="Something went wrong. Please try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          selectSize="sm"
          options={ROLE_FILTER_OPTIONS}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
        />
        <Select
          selectSize="sm"
          options={venueFilterOptions}
          value={venueFilter}
          onChange={(e) => setVenueFilter(e.target.value)}
          aria-label="Filter by venue"
        />
        <Select
          selectSize="sm"
          options={STATUS_FILTER_OPTIONS}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No staff found" description="Invite someone to get started, or adjust your filters." />
      ) : (
        <DataTable columns={columns} data={filtered} searchPlaceholder="Filter by name or email..." />
      )}
    </div>
  );
}
