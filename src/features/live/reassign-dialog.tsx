'use client';
import { useMemo, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { formatInTimeZone } from 'date-fns-tz';
import type { Ticket, User, Venue } from '@goldstar/platform';
import { STAFF_ROLES } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { useVenueShifts } from '@/features/shifts/use-shifts';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Select } from '@/components/ui/forms/Select';
import { Text } from '@/components/ui/typography';
import { ticketSummary } from './status-copy';

export interface ReassignDialogProps {
  /** Parent mounts this component only while the dialog should be open (see the header comment
   * below for why) — closing is a request to UNMOUNT, made via `onClose`, not a boolean prop. */
  onClose: () => void;
  operatorId: string;
  ticket: Ticket;
  venue: Venue | undefined;
  /** Every operator staff member — filtered here to who's eligible to pick. */
  staff: User[];
}

/**
 * Reassign quick action: sets `attendants.claimedBy` on an already-claimed ticket, a
 * status-preserving edit under `firestore.rules`' ticket update branch 2 (`onlyChanged([...,
 * 'attendants']) && (!mapChanged('attendants') || isManager())`).
 *
 * VALET ONLY (Fix round 1, task-3-review.md Major) — `ticket-quick-actions.tsx` only ever mounts
 * this for `ticket.jobType === 'valet'`; `claimedBy` is the valet-specific attendants field
 * (drive_home/ride use `primaryDriverUid`/`chaseDriverUid` instead, reassigned via Plan 5's
 * dispatch flow, not this board). This component does not re-check `jobType` itself — it trusts
 * its only caller, same as `canMarkStaged`'s own `jobType === 'valet'` gate one function up.
 *
 * Every viewer of this page is
 * already a manager (owner/admin/lead) per `(operator)/layout.tsx`'s `OperatorGate`, or a
 * platform admin, so no client-side role gate is needed here (a denial, if the write is ever
 * rejected — e.g. a lead reassigning a ticket at a venue outside their `venueIds` claim, since
 * branch 2 requires `venueMatch()` for leads even though `isManager()` alone grants the board's
 * LIST access to every venue — surfaces from the write itself via `toast.error`, matching
 * `clock-audit-panel.tsx`'s established pattern).
 *
 * Written with Firestore's dot-notation field path (`'attendants.claimedBy'`), not a full
 * `attendants: {...}` object — a plain top-level `attendants: {...}` write would REPLACE the
 * whole map (dropping `checkedInBy`/`primaryDriverUid`/etc.), where the dot path merges just the
 * one sub-key, matching exactly how goldstar-mobile's `transition.ts` writes the same field.
 *
 * Picker source (controller carry, task-3-brief.md): today's shift `assignedUids` at this venue
 * if any are scheduled (cheap — reuses `use-shifts.ts`'s already-registered `venueShifts` query),
 * else every staff member with a role at this venue. Disclosed: "today" is resolved in the
 * venue's OWN timezone (falls back to UTC if unset, matching `venue-form.tsx`'s optional
 * `timezone` field), not the viewer's browser timezone — consistent with this workspace's
 * venue-local-time house rule.
 *
 * The caller (`ticket-quick-actions.tsx`) mounts this component ONLY while the dialog should be
 * visible, rather than always rendering it with a boolean `open` prop — `useVenueShifts` above is
 * a live `onSnapshot` listener, and a per-row `open`-gated-but-always-mounted dialog would open
 * one such listener per ticket row in a venue (all querying the exact same venue+date) the moment
 * the board renders, not just when a manager actually opens Reassign.
 */
export function ReassignDialog({ onClose, operatorId, ticket, venue, staff }: ReassignDialogProps) {
  const [uid, setUid] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const today = formatInTimeZone(new Date(), venue?.timezone ?? 'UTC', 'yyyy-MM-dd');
  const { data: todaysShifts } = useVenueShifts(operatorId, venue?.id, today, today);

  const onShiftUids = useMemo(() => new Set(todaysShifts.flatMap((s) => s.assignedUids)), [todaysShifts]);

  const venueStaff = useMemo(
    () => staff.filter((u) => u.venueIds.includes(venue?.id ?? '') && u.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))),
    [staff, venue?.id],
  );

  const candidates = onShiftUids.size > 0 ? venueStaff.filter((u) => onShiftUids.has(u.uid)) : venueStaff;

  const options = candidates.map((u) => ({ value: u.uid, label: u.displayName }));

  const submit = async () => {
    if (!uid) return;
    setSubmitting(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/tickets/${ticket.id}`), { 'attendants.claimedBy': uid });
      toast.success('Ticket reassigned');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {ticketSummary(ticket)}</DialogTitle>
          <DialogDescription>Choose who this ticket is claimed by.</DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <Text size="sm" color="tertiary">
            No staff with a role at this venue{onShiftUids.size > 0 ? ' are on today’s shift' : ''} yet.
          </Text>
        ) : (
          <Select
            label="Assign to"
            aria-label="Assign to"
            options={options}
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="Choose staff"
          />
        )}
        {/* Labeled "Close"/"Confirm reassign", not "Cancel"/"Reassign" — this dialog is opened
            FROM a "Reassign" trigger sitting next to a ticket-cancellation "Cancel" trigger
            (`ticket-quick-actions.tsx`); reusing either word here would leave two
            identically-named buttons on screen at once, an accessibility/testability smell. */}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!uid || submitting}>
            Confirm reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
