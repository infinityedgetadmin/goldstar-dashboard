'use client';
import { useState } from 'react';
import type { Ticket } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms/Input';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Text } from '@/components/ui/typography';
import { formatMoney } from '@/lib/format';

export interface RefundDialogProps {
  onClose: () => void;
  ticket: Ticket;
}

const REASON_MAX = 200;

/**
 * Admin-only Refund action: amount + reason -> `staffRefund` (input contract from
 * `@goldstar/platform`'s `callables.staffRefund`: `{ ticketId, amount?, reason }`, amount in
 * cents; omitted amount means a full refund of `payment.total`). `amount` here is entered in
 * dollars (the natural unit for a human typing a partial-refund figure) and converted to cents at
 * submit — never the other way around, since `moneySchema` is `z.number().int()` and a
 * dollars-as-a-string round-trip through `parseFloat` can produce a non-integer cents value for
 * inputs like "19.005".
 */
export function RefundDialog({ onClose, ticket }: RefundDialogProps) {
  const total = ticket.payment?.total ?? 0;
  const [amountDollars, setAmountDollars] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const trimmedReason = reason.trim();
  const parsedAmount = amountDollars.trim() === '' ? undefined : Math.round(parseFloat(amountDollars) * 100);
  const amountValid = parsedAmount === undefined || (Number.isFinite(parsedAmount) && parsedAmount > 0 && parsedAmount <= total);
  const valid = trimmedReason.length > 0 && trimmedReason.length <= REASON_MAX && amountValid;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await callable('staffRefund')({ ticketId: ticket.id, reason: trimmedReason, ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}) });
      toast.success('Refund submitted');
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
          <DialogTitle>Refund</DialogTitle>
          <DialogDescription>Leave the amount blank for a full refund of {formatMoney(total, ticket.payment?.currency ?? 'USD')}.</DialogDescription>
        </DialogHeader>
        <Input
          label="Amount (optional, for a partial refund)"
          aria-label="Refund amount in dollars"
          type="number"
          min={0.01}
          max={total / 100}
          step={0.01}
          placeholder={(total / 100).toFixed(2)}
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
        />
        {!amountValid && (
          <Text size="xs" color="error">
            Amount must be between $0.01 and {formatMoney(total, ticket.payment?.currency ?? 'USD')}.
          </Text>
        )}
        <Textarea
          label="Reason"
          aria-label="Refund reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          rows={3}
          helperText={`${trimmedReason.length}/${REASON_MAX}`}
        />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} loading={submitting} disabled={!valid || submitting}>
            Submit refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
