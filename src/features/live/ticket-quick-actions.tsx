'use client';
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { canTransition, nowIso, type Ticket, type User, type Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { useSession } from '@/features/auth/use-session';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { ReassignDialog } from './reassign-dialog';
import { CancelTicketDialog } from './cancel-ticket-dialog';

export interface TicketQuickActionsProps {
  operatorId: string;
  ticket: Ticket;
  venue: Venue | undefined;
  staff: User[];
}

const NOT_CANCELLABLE = new Set<Ticket['status']>(['closed', 'cancelled', 'delivered', 'completed']);

/**
 * The three lead/admin quick actions from a live-ops row: Reassign, Mark staged, Cancel — shared
 * between `ticket-row.tsx` and `ticket-drawer.tsx` (one implementation, not duplicated per the
 * house DRY rule). No client-side role gate on any of the three: `(operator)/layout.tsx`'s
 * `OperatorGate` already restricts the ENTIRE `(operator)` shell (this page included) to
 * owner/admin/lead or a platform admin, so every viewer who can reach this component already
 * satisfies `firestore.rules`' manager checks for all three writes — a denial (e.g. a lead acting
 * outside their `venueIds` on the venue-scoped Reassign branch) surfaces from the write itself via
 * `toast.error`, matching `clock-audit-panel.tsx`'s established pattern.
 *
 * Reassign (Fix round 1, task-3-review.md Major): VALET-ONLY. `attendants` is one shared object
 * across every job type (`checkedInBy`/`claimedBy`/`deliveredBy` for valet;
 * `primaryDriverUid`/`chaseDriverUid`/`chaseVehicleId` for drive_home/ride — all optional, all
 * coexisting on the same doc, `goldstar-platform/src/schemas/ticket.ts`). The original
 * implementation wrote `attendants.claimedBy` unconditionally, including for drive_home/ride
 * tickets (which DO render on this board — `venueId` is required for every job type, and
 * `ACTIVE_JOB_STATUSES` in `use-live-tickets.ts` covers their in-progress statuses). That silently
 * set a field nothing downstream reads for those job types (`assigneeLabel()`/`TicketDrawer` both
 * read `claimedBy || primaryDriverUid`, so the UI would show the picked person as "assigned" while
 * `primaryDriverUid` — the field the mobile app, `myPrimaryJobs`, and `liveLocations` write
 * eligibility all actually key off — stayed untouched: a dispatcher-facing lie about who has the
 * car). Reassigning a driver on an in-progress drive_home/ride job is Plan 5's `dispatchAssign`
 * territory (primary/chase selection with `eligibility.driveHome`/`passengerRide` checks this
 * board must not bypass with a raw claimedBy-shaped write) — out of scope here. Job tickets get an
 * honest note instead of a working (or silently-wrong) button.
 *
 * Mark staged (controller carry, task-3-brief.md): unlike Reassign, this is a STATUS TRANSITION
 * (`firestore.rules` branch 1, not the status-preserving branch 2) — `retrieving -> staged` is the
 * one this action targets (the natural point in the valet flow: keys retrieved, car now staged
 * curbside but not yet called "ready"). Gated to exactly that (from, to) pair via `canTransition`
 * (the SAME state-machine source `firestore.rules`' generated `allowedTransition`/
 * `roleMayTransition` are compiled from, and what goldstar-mobile's `transition.ts` uses) rather
 * than re-deriving the check by hand. The write carries exactly the two keys the rules'
 * `timesKeysForStatus('staged')` allows (`status`, `times.stagedAt` via dot-path merge) — a
 * manager's write additionally bypasses `attendantsKeysForTransition` entirely (`isManager()` on
 * the rule's last conjunct), so no `attendants` key is touched. Deliberately scoped to
 * `retrieving -> staged` only (valet also allows `requested -> staged`, a skip-ahead path with no
 * natural trigger in this board — out of scope for this action).
 */
export function TicketQuickActions({ operatorId, ticket, venue, staff }: TicketQuickActionsProps) {
  const { claims } = useSession();
  const [dialog, setDialog] = useState<'reassign' | 'cancel' | null>(null);
  const [markingStaged, setMarkingStaged] = useState(false);

  const canReassign = ticket.jobType === 'valet';
  const canMarkStaged =
    ticket.jobType === 'valet' &&
    ticket.status === 'retrieving' &&
    canTransition({ jobType: ticket.jobType, from: ticket.status, to: 'staged', roles: claims?.roles ?? [] }).ok;
  const cancellable = !NOT_CANCELLABLE.has(ticket.status);

  const markStaged = async () => {
    setMarkingStaged(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/tickets/${ticket.id}`), { status: 'staged', 'times.stagedAt': nowIso() });
      toast.success('Marked staged');
    } catch (e) {
      // Nit (Fix round 1, task-3-review.md): a stale-status race here (e.g. a mobile attendant's
      // own `retrieving -> ready` write lands first, so this `retrieving -> staged` write now
      // fails `allowedTransition` against the server's current status) throws a plain Firestore
      // `FirebaseError`, not a `PlatformError` — `sanitizeError()` has no situational copy for it
      // and falls through to the generic "Something went wrong" message. That's correct per the
      // house error-sanitization rule (never show raw error text), just not maximally helpful; the
      // row's own `onSnapshot` listener self-corrects the displayed status within moments
      // regardless, so a more specific "this ticket already changed" toast wasn't worth the extra
      // race-classification logic for a race that's already visibly resolved a beat later.
      toast.error(e);
    } finally {
      setMarkingStaged(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canReassign ? (
          <Button size="sm" variant="secondary" onClick={() => setDialog('reassign')}>
            Reassign
          </Button>
        ) : (
          <Text size="xs" color="tertiary">
            Driver assignments are managed from Dispatch.
          </Text>
        )}
        {canMarkStaged && (
          <Button size="sm" variant="secondary" loading={markingStaged} onClick={markStaged}>
            Mark staged
          </Button>
        )}
        {cancellable && (
          <Button size="sm" variant="danger" onClick={() => setDialog('cancel')}>
            Cancel
          </Button>
        )}
      </div>
      {dialog === 'reassign' && (
        <ReassignDialog operatorId={operatorId} ticket={ticket} venue={venue} staff={staff} onClose={() => setDialog(null)} />
      )}
      {dialog === 'cancel' && <CancelTicketDialog ticket={ticket} onClose={() => setDialog(null)} />}
    </>
  );
}
