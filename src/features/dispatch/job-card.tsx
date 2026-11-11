'use client';
import { useState } from 'react';
import type { FleetVehicle, Ticket, TicketStatus, User } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { STATUS_LABEL, STATUS_TONE } from '@/features/live/status-copy';
import { SlaTimer } from '@/features/live/sla-timer';
import { CancelTicketDialog } from '@/features/live/cancel-ticket-dialog';
import { AssignDialog } from './assign-dialog';

/**
 * Operator-facing dispatch copy, left as literals on purpose (Ruling AZ). The strings match
 * `CHARGE_LABELS` today, but this map covers only the two dispatchable job types — deriving a
 * PARTIAL map from the shared constant reads worse than stating it, and Ruling AZ scopes that
 * constant to the guest-facing charge line rather than to every job label in the product. The
 * guest surface's `linked-jobs-switcher.tsx` DOES derive from it: that one is a full
 * `Record<JobType, string>` a guest reads beside the charge line, which is squarely in scope.
 */
const JOB_TYPE_LABEL: Record<'drive_home' | 'passenger_ride', string> = { drive_home: 'Drive home', passenger_ride: 'Ride' };

/**
 * Client-side mirror of the platform's own cancel rule table (`src/state/driveHome.ts` /
 * `src/state/ride.ts`, goldstar-platform) — a UI-only convenience so the Cancel action isn't
 * offered on a job the server would just reject anyway. NOT the source of truth: a drift here just
 * means a click surfaces a sanitized toast from `staffCancelTicket` instead of the button never
 * appearing — `canTransition` isn't re-derived client-side because it isn't exported for
 * job-cancel specifically in a form this component can call without also wiring `roles`/`ctx` the
 * callable itself already checks server-side.
 *
 * Fix round (Major #1, task-45-review.md): both `driveHome.ts` and `ride.ts` have a SECOND
 * cancel-transition group beyond the first, guest-cancellable one — `in_transit`/`arrived`, gated
 * to `M` (owner/admin/lead) only, i.e. staff-only, no guest self-cancel, which is exactly the shape
 * a dispatch-board action should have. The original set here only captured the first group and
 * missed this second one, silently hiding a real, server-permitted staff action from the ONE tool
 * built specifically for managing these jobs. Verified directly against both rule tables
 * (`src/state/driveHome.ts:17-18`, `src/state/ride.ts:17-18`) before this fix, not just re-trusting
 * the prior (wrong) claim. The complete per-jobType set below is the union of both groups —
 * `'completed'` is the only genuinely non-cancellable boundary left for either job type.
 */
const CANCELLABLE_STATUSES: Record<'drive_home' | 'passenger_ride', readonly TicketStatus[]> = {
  drive_home: ['requested', 'quoted', 'confirmed', 'assigned', 'en_route_to_guest', 'pre_drive_inspection', 'in_transit', 'arrived'],
  passenger_ride: ['requested', 'quoted', 'confirmed', 'assigned', 'en_route_to_pickup', 'arrived_pickup', 'in_transit', 'arrived'],
};

function destination(ticket: Ticket): string | undefined {
  return ticket.jobType === 'drive_home' ? ticket.driveHome?.destination.address : ticket.jobType === 'passenger_ride' ? ticket.ride?.dropoff.address : undefined;
}

function driverLabel(ticket: Ticket, staffByUid: Map<string, User>): string | undefined {
  const primary = ticket.attendants.primaryDriverUid;
  if (!primary) return undefined;
  const primaryName = staffByUid.get(primary)?.displayName ?? primary;
  if (ticket.jobType !== 'drive_home' || !ticket.attendants.chaseDriverUid) return primaryName;
  const chaseName = staffByUid.get(ticket.attendants.chaseDriverUid)?.displayName ?? ticket.attendants.chaseDriverUid;
  return `${primaryName} (chase: ${chaseName})`;
}

export interface JobCardProps {
  ticket: Ticket;
  drivers: User[];
  vehicles: FleetVehicle[];
  staffByUid: Map<string, User>;
}

/** Statuses where the office owes the next step before a driver is out: a request to quote, or a
 * confirmed job to assign. Quoted waits on the guest, and anything from assigned on is under way, so
 * a wait timer there read as overdue for the whole trip (148m on a completed job). */
const WAITING_ON_OFFICE: ReadonlySet<Ticket['status']> = new Set(['requested', 'confirmed']);

/**
 * One dispatch-board job card (Plan 5 Task 4): destination, status, SLA wait timer (only while
 * {@link WAITING_ON_OFFICE}; same
 * `SlaTimer` component/thresholds the live-ops board uses, anchored to `times.requestedAt` — job
 * tickets have no dedicated `times.confirmedAt`, so this is the same convention TicketRow already
 * relies on for a "how long has this been waiting" readout), assigned driver(s), and the
 * status-gated actions: re-quote (`quoted` only — `dispatchQuote` rejects any other status),
 * assign (`confirmed` only — the state machine's only rule into `assigned`), cancel (mirrors the
 * platform's own per-jobType cancel rule table).
 */
export function JobCard({ ticket, drivers, vehicles, staffByUid }: JobCardProps) {
  const jobType = ticket.jobType as 'drive_home' | 'passenger_ride';
  const [dialog, setDialog] = useState<'assign' | 'cancel' | null>(null);
  const [requoting, setRequoting] = useState(false);

  const driver = driverLabel(ticket, staffByUid);
  const cancellable = CANCELLABLE_STATUSES[jobType].includes(ticket.status);

  const requote = async () => {
    setRequoting(true);
    try {
      await callable('dispatchQuote')({ ticketId: ticket.id });
      toast.success('Quote refreshed');
    } catch (e) {
      toast.error(e);
    } finally {
      setRequoting(false);
    }
  };

  return (
    <Card variant="outlined" padding="sm" className="space-y-2" data-testid="job-card">
      <div className="flex items-center justify-between gap-2">
        <Text size="sm" weight="semibold">
          {JOB_TYPE_LABEL[jobType]}
        </Text>
        <StatusPill label={STATUS_LABEL[ticket.status]} tone={STATUS_TONE[ticket.status]} />
      </div>
      {destination(ticket) ? (
        <Text size="sm" color="secondary">
          {destination(ticket)}
        </Text>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {WAITING_ON_OFFICE.has(ticket.status) && ticket.times.requestedAt ? <SlaTimer since={ticket.times.requestedAt} /> : null}
      </div>
      <Text size="xs" color="tertiary">
        {driver ? `Assigned to ${driver}` : 'Unassigned'}
      </Text>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {ticket.status === 'quoted' ? (
          <Button size="sm" variant="secondary" loading={requoting} onClick={requote}>
            Re-quote
          </Button>
        ) : null}
        {ticket.status === 'confirmed' ? (
          <Button size="sm" onClick={() => setDialog('assign')}>
            Assign driver
          </Button>
        ) : null}
        {cancellable ? (
          <Button size="sm" variant="danger" onClick={() => setDialog('cancel')}>
            Cancel
          </Button>
        ) : null}
      </div>

      {dialog === 'assign' ? (
        <AssignDialog open onOpenChange={(open) => !open && setDialog(null)} ticket={ticket} drivers={drivers} vehicles={vehicles} onAssigned={() => setDialog(null)} />
      ) : null}
      {dialog === 'cancel' ? <CancelTicketDialog ticket={ticket} onClose={() => setDialog(null)} /> : null}
    </Card>
  );
}
