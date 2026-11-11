'use client';
import { useState } from 'react';
import type { Transaction, Venue } from '@goldstar/platform';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { daysAgoLocal, endOfLocalDay, startOfLocalDay, todayLocal } from '@/lib/local-date-range';
import type { TransactionSearchFilters } from './use-transactions-search';

/** `paymentsSearch`'s installed contract has no `TRANSACTION_STATUSES` const export (unlike
 * `TICKET_STATUSES`) — hardcoded here, same as `payment-panel.tsx`'s own `TX_STATUS_TONE` keys. */
const TRANSACTION_STATUSES: readonly Transaction['status'][] = ['pending', 'authorized', 'succeeded', 'failed', 'refunded'];
const STATUS_LABEL: Record<Transaction['status'], string> = {
  pending: 'Pending',
  authorized: 'Authorized',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
};

export interface PaymentsFiltersValue {
  venueId: string;
  status: Transaction['status'] | '';
  from: string; // yyyy-mm-dd (browser-local date input)
  to: string; // yyyy-mm-dd
}

export interface PaymentsFiltersProps {
  venues: Venue[];
  /** `venueId` omitted entirely restricts the caller to whatever venues their own claims allow
   * (server-enforced) — same convention as `tickets/filters.tsx`'s `restrictToVenueIds`. */
  restrictToVenueIds?: string[];
  onSearch: (filters: TransactionSearchFilters) => void;
}

/** Payments explorer filters (Task 6): date range + optional venue + optional status, per the
 * installed `paymentsSearch` contract (no `method` filter — see `use-transactions-search.ts`'s
 * header comment on why the brief's mention of one is stale). Mirrors `tickets/filters.tsx`
 * structurally. */
export function PaymentsFilters({ venues, restrictToVenueIds, onSearch }: PaymentsFiltersProps) {
  const availableVenues = restrictToVenueIds ? venues.filter((v) => restrictToVenueIds.includes(v.id)) : venues;
  const [value, setValue] = useState<PaymentsFiltersValue>({
    venueId: '',
    status: '',
    from: daysAgoLocal(7),
    to: todayLocal(),
  });

  const runSearch = (next: PaymentsFiltersValue) => {
    const filters: TransactionSearchFilters = {
      from: startOfLocalDay(next.from),
      to: endOfLocalDay(next.to),
      ...(next.venueId ? { venueId: next.venueId } : {}),
      ...(next.status ? { status: next.status } : {}),
    };
    onSearch(filters);
  };

  const update = <K extends keyof PaymentsFiltersValue>(key: K, v: PaymentsFiltersValue[K]) => {
    setValue((prev) => ({ ...prev, [key]: v }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(value);
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Payment filters">
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
        onChange={(e) => update('status', e.target.value as Transaction['status'] | '')}
        options={TRANSACTION_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
        placeholder="Any status"
      />
      <Input type="date" label="From" value={value.from} onChange={(e) => update('from', e.target.value)} />
      <Input type="date" label="To" value={value.to} onChange={(e) => update('to', e.target.value)} />
      <div className="flex items-end sm:col-span-2 lg:col-span-4">
        <Button type="submit">Search</Button>
      </div>
    </form>
  );
}
