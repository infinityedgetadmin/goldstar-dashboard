'use client';
import { useMemo, useState } from 'react';
import type { Venue } from '@goldstar/platform';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input, Select } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { callable } from '@/lib/firebase/callables';
import { formatMoney } from '@/lib/format';
import { toast } from '@/lib/toast';

export interface IssueValidationDialogProps {
  /** Mirrors `cancel-ticket-dialog.tsx`'s mount-while-open convention. */
  onClose: () => void;
  venue: Venue;
  /** Operator currency (`session.operator.currency`) — every amount formats through this. */
  currency: string;
}

type ValidationType = 'full' | 'partial' | 'comp' | 'rate';

/**
 * Parses a host-typed dollar amount into integer cents. Exported for its own unit test.
 * Returns null for anything that isn't a positive money amount (blank, negative, NaN, more
 * than 2 decimals). `Math.round` after the `* 100` is the standard exact-for-money-sized-values
 * float correction; the result is always an integer, and display always goes back through
 * `formatMoney` — no hand-rolled formatting anywhere.
 */
export function parseDollarsToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\$?\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const cents = Math.round(Number(trimmed.replace('$', '')) * 100);
  return cents > 0 ? cents : null;
}

/**
 * Issue-validation dialog (Plan 7 Task 1b): `full` / `partial` (amount ≤
 * `venue.rates.validations.maxAmount`) / `comp` / `rate` (an alternate valet rate by id) →
 * `venueIssueValidation` → the returned code is shown for the host to hand to the guest.
 *
 * The partial max is enforced client-side for UX only — the SERVER owns the rule
 * (`venueIssueValidation`'s handler re-validates against the venue's rates; this dialog's check
 * merely saves the host a round-trip). `partial` is offered only when the venue's
 * `rates.validations.allowPartial` says so; `rate` only when the venue actually has alternate
 * valet rate items to point at.
 *
 * The contract's optional `ticketId` ("apply immediately") is deliberately not surfaced here —
 * a host has no way to know a ticket's UUID, and applying a validation at the stand is the staff
 * flow (`staffApplyValidation`, entered by code). Disclosed in task-1b-report.md.
 */
export function IssueValidationDialog({ onClose, venue, currency }: IssueValidationDialogProps) {
  const allowPartial = venue.rates.validations.allowPartial;
  const maxAmount = venue.rates.validations.maxAmount;
  const rateItems = venue.rates.valet.items;

  const [type, setType] = useState<ValidationType>('full');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | undefined>(undefined);
  const [rateId, setRateId] = useState(rateItems[0]?.id ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [issuedCode, setIssuedCode] = useState<string | null>(null);

  const typeOptions = useMemo(
    () => [
      { value: 'full', label: 'Full — covers the valet charge' },
      ...(allowPartial ? [{ value: 'partial', label: `Partial — up to ${formatMoney(maxAmount, currency)}` }] : []),
      { value: 'comp', label: 'Comp' },
      ...(rateItems.length > 0 ? [{ value: 'rate', label: 'Alternate rate' }] : []),
    ],
    [allowPartial, maxAmount, rateItems.length, currency]
  );

  const submit = async () => {
    let cents: number | null = null;
    if (type === 'partial') {
      cents = parseDollarsToCents(amount);
      if (cents === null) {
        setAmountError('Enter an amount, e.g. 12.50');
        return;
      }
      if (cents > maxAmount) {
        setAmountError(`The most you can validate is ${formatMoney(maxAmount, currency)}.`);
        return;
      }
    }
    setAmountError(undefined);
    setSubmitting(true);
    try {
      const res = await callable('venueIssueValidation')({
        venueId: venue.id,
        type,
        ...(type === 'partial' && cents !== null ? { amount: cents } : {}),
        ...(type === 'rate' ? { rateId } : {}),
      });
      setIssuedCode(res.code);
      toast.success('Validation issued');
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {issuedCode ? (
          <>
            <DialogHeader className="pr-12">
              <DialogTitle>Validation issued</DialogTitle>
              <DialogDescription>Give the guest this code — the valet stand applies it at pickup.</DialogDescription>
            </DialogHeader>
            <Text as="p" size="lg" weight="semibold" className="text-center font-mono text-3xl tracking-widest" data-testid="issued-code">
              {issuedCode}
            </Text>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="pr-12">
              <DialogTitle>Issue a validation</DialogTitle>
              <DialogDescription>The guest hands the code to the valet stand at pickup.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select
                label="Type"
                options={typeOptions}
                value={type}
                onChange={(e) => {
                  setType(e.target.value as ValidationType);
                  setAmountError(undefined);
                }}
              />
              {type === 'partial' ? (
                <Input
                  label="Amount"
                  required
                  inputMode="decimal"
                  placeholder="12.50"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setAmountError(undefined);
                  }}
                  helperText={`Up to ${formatMoney(maxAmount, currency)} — the stand enforces this too.`}
                  error={amountError}
                />
              ) : null}
              {type === 'rate' ? (
                <Select
                  label="Rate"
                  options={rateItems.map((r) => ({ value: r.id, label: `${r.label} — ${formatMoney(r.amount, currency)}` }))}
                  value={rateId}
                  onChange={(e) => setRateId(e.target.value)}
                />
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} loading={submitting} disabled={submitting}>
                Issue validation
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
