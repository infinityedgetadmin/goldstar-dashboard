'use client';
import { useMemo } from 'react';
import { Select } from '@/components/ui/forms';
import { useVenue } from './venue-context';

/**
 * Venue-portal topbar control for a host who works more than one of the
 * operator's venues.
 *
 * Renders NOTHING for a single-venue session (the overwhelmingly common
 * case — one restaurant, one host stand): a one-option picker is noise, and
 * it would invite the reader to believe more venues exist. Options come
 * straight from `useVenue().venues`, which is claim-derived — this control
 * can never offer a venue the session isn't entitled to.
 */
export function VenueSwitcher() {
  const { venues, venueId, setVenueId } = useVenue();

  const options = useMemo(() => venues.map((v) => ({ value: v.id, label: v.name })), [venues]);

  if (venues.length < 2) return null;

  return (
    <Select
      selectSize="sm"
      aria-label="Venue"
      options={options}
      value={venueId ?? ''}
      onChange={(e) => setVenueId(e.target.value)}
    />
  );
}
