'use client';
import { useId, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/forms';
import { Label } from '@/components/ui/typography';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useVenue } from './venue-context';

/**
 * Host pre-arrival form (Plan 7 Task 1b): name, ETA, party size, VIP toggle, note →
 * `venueHostRequest` kind `pre_arrival`. Appears on the staff queue as a "Pre-arrival" card
 * (Plan 7's platform half). `venueId` comes from `useVenue()` (claim-derived), never user input.
 */
export function PreArrivalForm() {
  const { venue } = useVenue();
  const vipId = useId();
  const [name, setName] = useState('');
  const [eta, setEta] = useState('');
  const [partySize, setPartySize] = useState('');
  const [vip, setVip] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venue || !name.trim()) return;
    setSubmitting(true);
    try {
      await callable('venueHostRequest')({
        venueId: venue.id,
        kind: 'pre_arrival',
        name: name.trim(),
        // v0.4.0 (contracts item 9): `eta`/`partySize`/`vip` are real input fields now. Until
        // 0.4.0 they were silently stripped by zod, so this form folded them into `note` — that
        // fold-in (`composePreArrivalNote`) and its tripwire test are deleted in the same commit
        // that re-vendored, per the contract's own instruction.
        ...(eta.trim() ? { eta: eta.trim() } : {}),
        ...(partySize.trim() ? { partySize: Number(partySize) } : {}),
        ...(vip ? { vip: true } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success('Pre-arrival sent to the valet stand');
      setName('');
      setEta('');
      setPartySize('');
      setVip(false);
      setNote('');
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Pre-arrival</CardTitle>
        <CardDescription>Let the stand know a guest is on the way.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Pre-arrival">
          <Input label="Guest name" required value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="ETA" type="time" value={eta} onChange={(e) => setEta(e.target.value)} />
            <Input
              label="Party size"
              type="number"
              min={1}
              max={50}
              inputMode="numeric"
              value={partySize}
              onChange={(e) => setPartySize(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <Checkbox id={vipId} checked={vip} onCheckedChange={(next) => setVip(next === true)} aria-label="VIP" />
            <Label htmlFor={vipId}>VIP</Label>
          </div>
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          <Button type="submit" loading={submitting} disabled={submitting || !name.trim()}>
            Send pre-arrival
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
