'use client';
import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import type { Claim } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Input } from '@/components/ui/forms/Input';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { formatMoney } from '@/lib/format';

export interface AdjudicationFormProps {
  operatorId: string;
  claim: Claim;
  /** The signed-in admin's uid — auto-attributed as `adjudication.decidedBy`; never a free-text field. */
  uid: string;
}

const NOTES_MAX = 4000;

/**
 * Adjudication (notes, decidedBy auto, amount) — direct `updateDoc` of `claim.adjudication`
 * (`firestore.rules`' claims update rule is `isAdmin() && unchanged(['evidenceBundle', 'ticketId',
 * 'operatorId'])`, no callable needed). Deliberately decoupled from the status stepper
 * (`claim-detail.tsx`'s own action bar): this form only ever writes `adjudication`, never `status`
 * — an admin can save/revise notes before committing to a status transition, and the two writes
 * don't need to be atomic with each other (both are plain admin-gated field updates on the same
 * doc; there's no partial-state hazard the schema or rules guard against).
 */
export function AdjudicationForm({ operatorId, claim, uid }: AdjudicationFormProps) {
  const [notes, setNotes] = useState(claim.adjudication?.notes ?? '');
  const [amountDollars, setAmountDollars] = useState(claim.adjudication?.amount !== undefined ? (claim.adjudication.amount / 100).toFixed(2) : '');
  const [saving, setSaving] = useState(false);

  const trimmedNotes = notes.trim();
  const parsedAmount = amountDollars.trim() === '' ? undefined : Math.round(parseFloat(amountDollars) * 100);
  const amountValid = parsedAmount === undefined || (Number.isFinite(parsedAmount) && parsedAmount >= 0);
  const valid = trimmedNotes.length > 0 && trimmedNotes.length <= NOTES_MAX && amountValid;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}/claims/${claim.id}`), {
        adjudication: { notes: trimmedNotes, decidedBy: uid, decidedAt: new Date().toISOString(), ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}) },
      });
      toast.success('Adjudication saved.');
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adjudication</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          label="Notes"
          aria-label="Adjudication notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={4}
          fullWidth
          helperText={`${trimmedNotes.length}/${NOTES_MAX}`}
        />
        <Input
          label="Settlement amount (optional)"
          aria-label="Settlement amount in dollars"
          type="number"
          min={0}
          step={0.01}
          value={amountDollars}
          onChange={(e) => setAmountDollars(e.target.value)}
          error={!amountValid ? 'Enter a non-negative amount.' : undefined}
        />
        {claim.adjudication && (
          <Text size="xs" color="tertiary">
            Last decided by {claim.adjudication.decidedBy} at {new Date(claim.adjudication.decidedAt).toLocaleString()}
            {claim.adjudication.amount !== undefined ? ` · ${formatMoney(claim.adjudication.amount)}` : ''}
          </Text>
        )}
        <Button onClick={save} loading={saving} disabled={!valid || saving}>
          Save adjudication
        </Button>
      </CardContent>
    </Card>
  );
}
