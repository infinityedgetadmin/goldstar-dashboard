'use client';
import { useState } from 'react';
import type { Ticket } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Textarea } from '@/components/ui/forms/Textarea';
import { ticketSummary } from './status-copy';

export interface CancelTicketDialogProps {
  /** Mirrors `reassign-dialog.tsx`'s mount-while-open convention. */
  onClose: () => void;
  ticket: Ticket;
}

const REASON_MAX = 200;

/**
 * Cancel quick action: a reason dialog that submits through the `staffCancelTicket` callable
 * (`{ ticketId, reason }`, `reason: z.string().min(1).max(200)`) — server-side so refund-on-cancel
 * logic (and the key-tag release/custody event a manager cancel needs, per goldstar-mobile's
 * `transition.ts`) runs, rather than a bare client `updateDoc` to `status: 'cancelled'` (which
 * `firestore.rules`' `transitionRequirements` would technically also accept for a manager, but
 * would skip that server-side follow-through entirely).
 *
 * Reused by the dispatch board (Plan 5 Task 4, `src/features/dispatch/job-card.tsx`) for
 * drive_home/passenger_ride jobs, not just this feature's own valet quick action — same callable,
 * same "reason, then cancel" shape, no reason to fork a second dialog. The authorization-voiding
 * note below only ever applies to a job ticket (`staffCancel.ts` only sets
 * `payment.refundRequested`/`refundRequestId` when `payment.status` is already `'paid'`/
 * `'authorized'` — a job's pre-capture authorization is the case this note is FOR; a checked_in
 * valet ticket has no payment yet, so its own cancel never hits this branch of copy).
 */
export function CancelTicketDialog({ onClose, ticket }: CancelTicketDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmed = reason.trim();
  const valid = trimmed.length > 0 && trimmed.length <= REASON_MAX;
  const voidsAuthorization = ticket.jobType !== 'valet' && ticket.payment?.status === 'authorized';

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await callable('staffCancelTicket')({ ticketId: ticket.id, reason: trimmed });
      toast.success('Ticket cancelled');
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
        <DialogHeader className="pr-12">
          <DialogTitle>Cancel {ticketSummary(ticket)}</DialogTitle>
          <DialogDescription>
            {voidsAuthorization
              ? "The guest and any assigned driver are notified. Their card's authorization is voided — they are not charged. This can't be undone."
              : "The guest and any assigned driver are notified. This can't be undone."}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          label="Reason"
          aria-label="Cancellation reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          rows={3}
          helperText={`${trimmed.length}/${REASON_MAX}`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Keep ticket
          </Button>
          <Button variant="danger" onClick={submit} loading={submitting} disabled={!valid || submitting}>
            Cancel ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
