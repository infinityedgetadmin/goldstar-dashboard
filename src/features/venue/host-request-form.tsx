'use client';
import { useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Input, Textarea } from '@/components/ui/forms';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useVenue } from './venue-context';

/**
 * Normalizes the host's phone field into the callable's `phoneLast4` / `phoneE164` pair
 * (Task 1b brief: "guest phone last 4 (or full phone when the host has it)"). Exported for its
 * own unit test. Returns null when the input is neither a last-4 nor a US number the contract's
 * `phoneE164` schema would accept.
 */
export function normalizePhoneInput(raw: string): { phoneLast4: string } | { phoneE164: string } | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 4) return { phoneLast4: digits };
  if (digits.length === 10) return { phoneE164: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith('1')) return { phoneE164: `+${digits}` };
  return null;
}

/**
 * Host "request a guest's car" form (Plan 7 Task 1b): table number, guest phone last 4 (or full
 * phone), name, note → `venueHostRequest` kind `car`. The handler matches the guest's active
 * `checked_in` ticket by phone; the response's `ticketId` tells matched from unmatched, and the
 * result copy is the brief's exact pair ("Car requested" / "No ticket found — the valet stand
 * has been notified").
 *
 * `venueId` comes from `useVenue()` (claim-derived) — never from user input.
 */
export function HostRequestForm() {
  const { venue } = useVenue();
  const [table, setTable] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venue) return;
    const normalized = normalizePhoneInput(phone);
    if (!normalized) {
      setPhoneError('Enter the last 4 digits, or a full US phone number.');
      return;
    }
    setPhoneError(undefined);
    setSubmitting(true);
    try {
      const res = await callable('venueHostRequest')({
        venueId: venue.id,
        kind: 'car',
        ...normalized,
        ...(table.trim() ? { table: table.trim() } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      if (res.ticketId) toast.success('Car requested');
      else toast.info('No ticket found — the valet stand has been notified');
      setTable('');
      setPhone('');
      setName('');
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
        <CardTitle>Request a car</CardTitle>
        <CardDescription>Send a guest&apos;s car request straight to the valet stand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Request a car">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Table" value={table} onChange={(e) => setTable(e.target.value)} placeholder="12" />
            <Input
              label="Guest phone"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(undefined);
              }}
              placeholder="Last 4 digits or full number"
              inputMode="tel"
              error={phoneError}
            />
          </div>
          <Input label="Guest name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional — anything the stand should know" />
          <Button type="submit" loading={submitting} disabled={submitting || !phone.trim()}>
            Request car
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
