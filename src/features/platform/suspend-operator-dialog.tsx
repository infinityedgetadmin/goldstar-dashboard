'use client';
import { useState } from 'react';
import { callable } from '@/lib/firebase/callables';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { toast } from '@/lib/toast';

export interface SuspendOperatorDialogProps {
  operatorId: string;
  operatorName: string;
  currentStatus: 'onboarding' | 'active' | 'suspended';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a successful status change. Optional — `use-operators.ts`'s hooks are live
   * `onSnapshot` listeners, so callers don't need to manually refetch/invalidate anything; this is
   * only for a caller that wants to react to the change itself (e.g. closing something else).
   */
  onSuccess?: () => void;
}

/**
 * Suspend/reactivate confirm dialog, shared by the operators table's row
 * action and the operator detail page. `className="pr-12"` on
 * `DialogHeader` — carry from the ledger (`operator-switcher.tsx`'s own
 * comment/usage): the title text otherwise runs under the dialog's
 * absolute-positioned 44px close button.
 */
export function SuspendOperatorDialog({ operatorId, operatorName, currentStatus, open, onOpenChange, onSuccess }: SuspendOperatorDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const suspending = currentStatus !== 'suspended';
  const nextStatus = suspending ? 'suspended' : 'active';

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await callable('platformSetOperatorStatus')({ operatorId, status: nextStatus });
      toast.success(suspending ? `${operatorName} suspended.` : `${operatorName} reactivated.`);
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>
            {suspending ? 'Suspend' : 'Reactivate'} {operatorName}?
          </DialogTitle>
          <DialogDescription>
            {suspending
              ? // Ruling C + C-2 (task-3-report.md follow-ups): firestore.rules' inOperator()/staffOf() gate
                // direct Firestore data access (Ruling C), and the staff-scoped Functions callables
                // (refunds, checkouts, cancellations, terminal tokens, Connect onboarding, scheduling sync)
                // now separately gate via requireActiveOperator() (Ruling C-2) — those run on the Admin SDK
                // and bypass Firestore rules entirely, so they needed their own check. Both halves are true
                // as of Ruling C-2; keep this copy in sync if either gate's scope changes.
                'Staff at this operator immediately lose both data access and the ability to take actions like checkouts, refunds, or cancellations — including anyone already signed in. Guest ticket and checkout links keep working.'
              : 'This operator will be marked active again, restoring staff access.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant={suspending ? 'danger' : 'primary'} loading={submitting} onClick={handleConfirm}>
            {suspending ? 'Suspend' : 'Reactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
