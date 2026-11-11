'use client';
import { useState } from 'react';
import type { FleetVehicle, Ticket, User } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { DriverPicker } from './driver-picker';
import { FleetPicker } from './fleet-picker';

export interface AssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: Ticket;
  drivers: User[];
  vehicles: FleetVehicle[];
  /** Called after a successful `dispatchAssign` — lets the board dismiss/refresh without waiting on
   * the live snapshot round-trip (same pattern as `invite-dialog.tsx`'s `onInvited`). */
  onAssigned?: () => void;
}

/**
 * Assign dialog (Plan 5 Task 4): eligible-driver picker (+ chase driver for drive_home, distinct
 * from the primary — client-side mirror of `dispatchAssign`'s own `chaseDriverUid ===
 * primaryDriverUid` rejection) and a fleet-vehicle picker (chase vehicle, optional, for drive_home;
 * required for passenger_ride, filtered to `accessible` when the ride needs it) → `dispatchAssign`.
 *
 * Client-side validation here mirrors, but does not replace, the server's own checks
 * (`functions/src/modules/dispatch/assign.ts`) — a mismatch (e.g. an eligibility flag that changed
 * between this dialog opening and submit) surfaces as a sanitized toast from the callable rejecting,
 * never a silent client-only success.
 */
export function AssignDialog({ open, onOpenChange, ticket, drivers, vehicles, onAssigned }: AssignDialogProps) {
  const isDriveHome = ticket.jobType === 'drive_home';
  const wantsAccessible = !isDriveHome && ticket.ride?.accessible === true;

  const [primaryDriverUid, setPrimaryDriverUid] = useState<string | undefined>(undefined);
  const [chaseDriverUid, setChaseDriverUid] = useState<string | undefined>(undefined);
  const [fleetVehicleId, setFleetVehicleId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setPrimaryDriverUid(undefined);
    setChaseDriverUid(undefined);
    setFleetVehicleId(undefined);
  };

  const valid = isDriveHome
    ? Boolean(primaryDriverUid && chaseDriverUid && primaryDriverUid !== chaseDriverUid)
    : Boolean(primaryDriverUid && fleetVehicleId);

  const submit = async () => {
    if (!valid || !primaryDriverUid) return;
    setSubmitting(true);
    try {
      await callable('dispatchAssign')({
        ticketId: ticket.id,
        primaryDriverUid,
        ...(isDriveHome ? { chaseDriverUid } : {}),
        ...(fleetVehicleId ? { fleetVehicleId } : {}),
      });
      toast.success('Driver assigned');
      reset();
      onOpenChange(false);
      onAssigned?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Assign driver</DialogTitle>
          <DialogDescription>
            {isDriveHome
              ? 'A primary driver takes the guest home in their own car; a chase driver follows to bring the primary back.'
              : 'A driver and a fleet vehicle for this ride.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <DriverPicker
            label={isDriveHome ? 'Primary driver' : 'Driver'}
            drivers={drivers}
            requiredField={isDriveHome ? 'driveHome' : 'passengerRide'}
            value={primaryDriverUid}
            onChange={setPrimaryDriverUid}
            excludeUid={isDriveHome ? chaseDriverUid : undefined}
            excludeReason="Already the chase driver"
          />

          {isDriveHome ? (
            <>
              <DriverPicker
                label="Chase driver"
                drivers={drivers}
                requiredField="driveHome"
                value={chaseDriverUid}
                onChange={setChaseDriverUid}
                excludeUid={primaryDriverUid}
                excludeReason="Already the primary driver"
              />
              <FleetPicker label="Chase vehicle (optional)" vehicles={vehicles} value={fleetVehicleId} onChange={setFleetVehicleId} allowNone />
            </>
          ) : (
            <FleetPicker label="Vehicle" vehicles={vehicles} value={fleetVehicleId} onChange={setFleetVehicleId} accessibleOnly={wantsAccessible} />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" loading={submitting} disabled={!valid} onClick={submit}>
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
