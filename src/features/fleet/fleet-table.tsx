'use client';
import { useMemo, useState } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import type { ColumnDef } from '@tanstack/react-table';
import type { FleetVehicle, User } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useCollection } from '@/lib/firebase/hooks';
import { useSession } from '@/features/auth/use-session';
import { toast } from '@/lib/toast';
import { DataTable } from '@/components/ui/data-table';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { FleetForm } from './fleet-form';

export interface FleetTableProps {
  operatorId: string;
}

const STATUS_TONE: Record<FleetVehicle['status'], StatusTone> = { available: 'positive', in_use: 'info', maintenance: 'warning', retired: 'neutral' };
const STATUS_LABEL: Record<FleetVehicle['status'], string> = { available: 'Available', in_use: 'In use', maintenance: 'Maintenance', retired: 'Retired' };

/**
 * Fleet vehicle CRUD (Plan 5 Task 4). Unlike venues (`venues-table.tsx` -> `/venues/new`),
 * `fleetVehicleSchema` is flat (no nested zones/rates editors) — a dialog form
 * (`fleet-form.tsx`, same shape as `invite-dialog.tsx`) is the right amount of UI, not a whole
 * page. Direct Firestore reads/writes (`useCollection`, `setDoc`/`updateDoc`/`deleteDoc`) — there
 * is no `fleetVehicle*` callable in the contracts package; `firestore.rules`' `fleetVehicles` block
 * (create/update: admin+; delete: owner+; `currentDriverUid` client-immutable) is the actual gate,
 * same pattern `venue-form.tsx` already establishes for venues.
 */
export function FleetTable({ operatorId }: FleetTableProps) {
  const { claims, isPlatformAdmin } = useSession();
  const { data: vehicles, loading, error } = useCollection<FleetVehicle>(`operators/${operatorId}/fleetVehicles`);
  const { data: staff } = useCollection<User>(`operators/${operatorId}/users`);
  const [formVehicle, setFormVehicle] = useState<FleetVehicle | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FleetVehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);

  // firestore.rules: create/update = isAdmin() (owner/admin); delete = isOwner() only — stricter.
  const canCreate = isPlatformAdmin || (claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);
  const canDelete = isPlatformAdmin || (claims?.roles.includes('owner') ?? false);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { db } = firebase();
      await deleteDoc(doc(db, `operators/${operatorId}/fleetVehicles/${deleteTarget.id}`));
      toast.success('Vehicle removed');
      setDeleteTarget(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<FleetVehicle>[] = useMemo(
    () => [
      {
        accessorKey: 'plate',
        header: 'Plate',
        cell: ({ row }) => (
          <button type="button" onClick={() => setFormVehicle(row.original)} className="text-body-sm font-medium text-text-primary hover:underline">
            {row.original.plate}
            {row.original.state ? ` (${row.original.state})` : ''}
          </button>
        ),
      },
      {
        id: 'vehicle',
        header: 'Vehicle',
        cell: ({ row }) => (
          <Text size="sm">
            {row.original.color} {row.original.make} {row.original.model}
          </Text>
        ),
      },
      { accessorKey: 'capacity', header: 'Capacity', cell: ({ row }) => <Text size="sm">{row.original.capacity}</Text> },
      {
        id: 'accessible',
        header: 'Accessible',
        cell: ({ row }) => (row.original.accessible ? <Badge size="sm">Accessible</Badge> : <Text size="sm" color="tertiary">—</Text>),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />,
      },
      {
        id: 'currentDriver',
        header: 'Current driver',
        cell: ({ row }) => {
          const uid = row.original.currentDriverUid;
          return (
            <Text size="sm" color={uid ? undefined : 'tertiary'}>
              {uid ? (staffByUid.get(uid)?.displayName ?? uid) : '—'}
            </Text>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setFormVehicle(row.original)}>
              Edit
            </Button>
            {canDelete ? (
              <Button size="sm" variant="danger" onClick={() => setDeleteTarget(row.original)}>
                Delete
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [staffByUid, canDelete]
  );

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading fleet…
      </Text>
    );
  }

  if (error) {
    return <EmptyState title="Couldn't load the fleet" description="Something went wrong. Please try again." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreate ? (
          <Button onClick={() => setFormVehicle('new')}>Add vehicle</Button>
        ) : null}
      </div>
      {vehicles.length === 0 ? (
        <EmptyState title="No vehicles yet" description="Add a vehicle to assign it to rides and chase drivers." />
      ) : (
        <DataTable columns={columns} data={vehicles} searchPlaceholder="Filter by plate, make, or model..." />
      )}

      {formVehicle ? (
        <FleetForm
          open
          onOpenChange={(open) => !open && setFormVehicle(null)}
          operatorId={operatorId}
          vehicle={formVehicle === 'new' ? undefined : formVehicle}
        />
      ) : null}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader className="pr-12">
            <DialogTitle>Delete {deleteTarget?.plate}?</DialogTitle>
            <DialogDescription>This can&apos;t be undone. The vehicle is removed from the fleet entirely.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
              Keep vehicle
            </Button>
            <Button type="button" variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
