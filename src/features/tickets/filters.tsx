'use client';
import { useState } from 'react';
import { TICKET_STATUSES, type JobType, type TicketStatus, type Venue } from '@goldstar/platform';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/typography';
import type { TicketSearchFilters } from './use-tickets-search';
import { STATUS_LABEL } from '@/features/live/status-copy';

export interface TicketFiltersValue {
  venueId: string;
  status: TicketStatus | '';
  jobType: JobType | '';
  from: string; // yyyy-mm-dd (browser-local date input)
  to: string; // yyyy-mm-dd
  plate: string;
  phoneLast4: string;
  includeArchived: boolean;
}

export interface TicketFiltersProps {
  venues: Venue[];
  /** `venueId` omitted entirely restricts the caller to whatever venues their own claims allow
   * (server-enforced) — this option is only shown when the viewer has more than one venue to pick
   * from, matching how a lead with exactly one venue has nothing to filter by. */
  restrictToVenueIds?: string[];
  onSearch: (filters: TicketSearchFilters) => void;
}

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoLocal(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Converts a browser-local `yyyy-mm-dd` date-input value into an ISO instant. There's no single
 * unambiguous "venue timezone" to anchor a multi-venue search's date range to (the whole point of
 * leaving `venueId` optional), so the range boundaries use the picker's own local calendar day —
 * disclosed simplification; every OTHER displayed timestamp in this feature (table rows, custody
 * timeline, photo metadata) is rendered in the TICKET's own venue timezone instead. */
function startOfLocalDay(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T00:00:00`).toISOString();
}
function endOfLocalDay(yyyyMmDd: string): string {
  return new Date(`${yyyyMmDd}T23:59:59.999`).toISOString();
}

const STATUS_OPTIONS = TICKET_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
/**
 * Deliberately NOT `CHARGE_LABELS` (Ruling AZ). That constant governs the guest-facing charge line
 * and guest-facing job labels; operator-facing copy may differ on purpose. In a filter dropdown
 * sitting beside "Valet" and "Drive home", "Passenger ride" reads clearer than the receipt's
 * "Ride" — a filter label is a different register from a line a guest reads on a bill. The values
 * ARE the contract's `JobType` keys, which is the part that has to match; only the copy diverges.
 */
const JOB_TYPE_OPTIONS: { value: JobType; label: string }[] = [
  { value: 'valet', label: 'Valet' },
  { value: 'drive_home', label: 'Drive home' },
  { value: 'passenger_ride', label: 'Passenger ride' },
];

export function TicketFilters({ venues, restrictToVenueIds, onSearch }: TicketFiltersProps) {
  const availableVenues = restrictToVenueIds ? venues.filter((v) => restrictToVenueIds.includes(v.id)) : venues;
  const [value, setValue] = useState<TicketFiltersValue>({
    venueId: '',
    status: '',
    jobType: '',
    from: daysAgoLocal(7),
    to: todayLocal(),
    plate: '',
    phoneLast4: '',
    includeArchived: false,
  });

  const runSearch = (next: TicketFiltersValue) => {
    const filters: TicketSearchFilters = {
      from: startOfLocalDay(next.from),
      to: endOfLocalDay(next.to),
      includeArchived: next.includeArchived,
      ...(next.venueId ? { venueId: next.venueId } : {}),
      ...(next.status ? { status: next.status } : {}),
      ...(next.jobType ? { jobType: next.jobType } : {}),
      // ticketsSearch's plate filter is an exact, case-sensitive match (search.ts's own comment) —
      // uppercased here to mirror goldstar-mobile's write-side `.toUpperCase()` on `vehicle.plate`,
      // so a plate typed in any case still matches how it was actually stored.
      ...(next.plate.trim() ? { plate: next.plate.trim().toUpperCase() } : {}),
      ...(next.phoneLast4.trim() ? { phoneLast4: next.phoneLast4.trim() } : {}),
    };
    onSearch(filters);
  };

  const update = <K extends keyof TicketFiltersValue>(key: K, v: TicketFiltersValue[K]) => {
    const next = { ...value, [key]: v };
    setValue(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(value);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ticket filters">
      {availableVenues.length > 0 && (
        <Select
          label="Venue"
          value={value.venueId}
          onChange={(e) => update('venueId', e.target.value)}
          options={availableVenues.map((v) => ({ value: v.id, label: v.name }))}
          placeholder="All venues"
        />
      )}
      <Select
        label="Status"
        value={value.status}
        onChange={(e) => update('status', e.target.value as TicketStatus | '')}
        options={STATUS_OPTIONS}
        placeholder="Any status"
      />
      <Select
        label="Job type"
        value={value.jobType}
        onChange={(e) => update('jobType', e.target.value as JobType | '')}
        options={JOB_TYPE_OPTIONS}
        placeholder="Any type"
      />
      <Input label="Plate" value={value.plate} onChange={(e) => update('plate', e.target.value)} placeholder="Exact plate" />
      <Input label="Phone last 4" value={value.phoneLast4} onChange={(e) => update('phoneLast4', e.target.value)} maxLength={4} placeholder="1234" />
      <Input type="date" label="From" value={value.from} onChange={(e) => update('from', e.target.value)} />
      <Input type="date" label="To" value={value.to} onChange={(e) => update('to', e.target.value)} />
      <div className="flex items-end gap-2">
        <Checkbox
          id="includeArchived"
          checked={value.includeArchived}
          onCheckedChange={(checked) => update('includeArchived', checked === true)}
        />
        <Label htmlFor="includeArchived" className="text-body-sm text-text-secondary">
          Include archived
        </Label>
      </div>
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit">Search</Button>
      </div>
    </form>
  );
}
