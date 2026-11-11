'use client';
import { useId, useState, type FormEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Select, Textarea } from '@/components/ui/forms';
import { Label, Text } from '@/components/ui/typography';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useVenue } from './venue-context';
import { VenueAddressField, type VenueAddress } from './venue-address-field';

const PARTY_SIZES = Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/**
 * Venue ride request (contracts v0.4.0, item 10 / Ruling R): a host books a passenger ride for a
 * guest, billed to the venue. Sends `venueHostRequest` kind `'ride'`.
 *
 * ALL THREE ride fields are collected from the host and NONE is defaulted. The contract marks
 * `dropoff`/`passengers`/`accessible` `.optional()` only because one input schema serves all
 * three `kind`s; the handler refines them to required for `kind: 'ride'`, and this form is what
 * supplies them:
 *
 * - `passengers` — a default of 1 would invent a party size that drives vehicle selection and can
 *   drive the quote, so a host requesting a ride for six would get a ticket saying one. There is
 *   no blank option: the host picks a number.
 * - `accessible` — the tempting default is `false`, read as "no stated need". It is the field that
 *   decides whether a wheelchair-accessible vehicle is dispatched, and a wrong default strands a
 *   person at a curb. Asked explicitly, as a required yes/no rather than an unchecked box that
 *   quietly means "no".
 * - `dropoff` — needs a concrete `{ address, geo }`; typed text alone is not a destination. See
 *   `venue-address-field.tsx`.
 *
 * The flow deliberately ENDS AT "requested". A venue user can no longer confirm a ride quote
 * (the H1 security fix removed `venue_user` and `guest` from `passenger_ride`'s
 * `quoted -> confirmed` transition — managers only), and `guestConfirmRide` refuses a
 * `billTo: 'venue'` ride outright, because it would charge the guest for work the venue is being
 * invoiced for. The operator's dispatch is the sign-off. The copy below says exactly that rather
 * than implying the ride is booked.
 */
export function RideRequestForm() {
  const { venue } = useVenue();
  const accessibleId = useId();
  const [name, setName] = useState('');
  const [dropoff, setDropoff] = useState<VenueAddress | null>(null);
  const [passengers, setPassengers] = useState('');
  const [accessible, setAccessible] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ dropoff?: string; passengers?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!venue) return;

    // Validated, never defaulted — a missing value is an error the host resolves, not something
    // this form decides on their behalf.
    const next: { dropoff?: string; passengers?: string } = {};
    if (!dropoff) next.dropoff = 'Pick the destination from the suggestions so the driver gets an exact location.';
    if (!passengers) next.passengers = 'How many people are riding?';
    setErrors(next);
    if (Object.keys(next).length > 0 || !dropoff) return;

    setSubmitting(true);
    try {
      await callable('venueHostRequest')({
        venueId: venue.id,
        kind: 'ride',
        dropoff,
        passengers: Number(passengers),
        accessible,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success('Ride requested — your valet operator will confirm it');
      setName('');
      setDropoff(null);
      setPassengers('');
      setAccessible(false);
      setNote('');
      setErrors({});
    } catch (err) {
      toast.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card variant="elevated">
      <CardHeader>
        <CardTitle>Request a ride</CardTitle>
        <CardDescription>Book a car for a guest, billed to the venue.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/*
          `noValidate`: `Destination` and `Passengers` keep `required` for their label marker and
          screen-reader semantics, but native constraint validation would abort submission before
          `submit()` runs — the host would get a browser bubble instead of the specific,
          tokens-styled message explaining what to do. This form owns its validation.
        */}
        <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4" aria-label="Request a ride">
          <Input label="Guest name" value={name} onChange={(e) => setName(e.target.value)} fullWidth />

          <VenueAddressField
            label="Destination"
            value={dropoff}
            proximity={venue?.geo}
            onChange={(v) => {
              setDropoff(v);
              if (v) setErrors((p) => ({ ...p, dropoff: undefined }));
            }}
            helperText="Start typing, then pick from the list."
            error={errors.dropoff}
          />

          <Select
            label="Passengers"
            required
            options={PARTY_SIZES}
            placeholder="Select…"
            value={passengers}
            onChange={(e) => {
              setPassengers(e.target.value);
              setErrors((p) => ({ ...p, passengers: undefined }));
            }}
            error={errors.passengers}
            fullWidth
          />

          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id={accessibleId}
                checked={accessible}
                onCheckedChange={(next) => setAccessible(next === true)}
                aria-label="Wheelchair-accessible vehicle needed"
              />
              <Label htmlFor={accessibleId}>Wheelchair-accessible vehicle needed</Label>
            </div>
            <Text size="xs" color="tertiary">
              Tick this if the guest uses a wheelchair — it decides which vehicle is sent.
            </Text>
          </div>

          <Textarea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />

          <Button type="submit" loading={submitting} disabled={submitting}>
            Request ride
          </Button>

          <Text size="xs" color="tertiary">
            This sends a request. Your valet operator confirms the ride and the price before a
            driver is assigned — it is not booked until they do.
          </Text>
        </form>
      </CardContent>
    </Card>
  );
}
