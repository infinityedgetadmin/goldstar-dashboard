'use client';
import { useState } from 'react';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Textarea } from '@/components/ui/forms/Textarea';

export interface RevealPhoneDialogProps {
  ticketId: string;
  onClose: () => void;
  /** Called with the revealed E.164 number on success — the dialog itself never displays it (the
   * caller decides where/how, e.g. swapping the masked display in the guest card). */
  onRevealed: (phoneE164: string) => void;
}

const REASON_MAX = 200;

/**
 * Admin-only reveal, per `ticketsRevealPhone`'s contract (`{ ticketId, reason }` -> `{ phoneE164
 * }`) — the callable itself writes the audit row (actor, ticket, reason); this dialog just
 * collects the required reason and surfaces the result. Never logs or displays the number
 * anywhere except by handing it back to the caller for the masked-by-default guest card to show.
 */
export function RevealPhoneDialog({ ticketId, onClose, onRevealed }: RevealPhoneDialogProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trimmed = reason.trim();
  const valid = trimmed.length > 0 && trimmed.length <= REASON_MAX;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      const out = await callable('ticketsRevealPhone')({ ticketId, reason: trimmed });
      onRevealed(out.phoneE164);
      toast.success('Number revealed — this action was logged to the audit trail.');
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
          <DialogTitle>Reveal phone number</DialogTitle>
          <DialogDescription>This action is recorded in the audit log with your name and the reason below.</DialogDescription>
        </DialogHeader>
        <Textarea
          label="Reason"
          aria-label="Reason for revealing phone number"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          rows={2}
          helperText={`${trimmed.length}/${REASON_MAX}`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting} disabled={!valid || submitting}>
            Reveal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
