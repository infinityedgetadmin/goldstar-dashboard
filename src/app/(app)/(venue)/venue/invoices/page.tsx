'use client';
import { VenueInvoices } from '@/features/venue/venue-invoices';

/**
 * Plan 7 Task 1b: thin route wrapper — the real invoices feature lives in
 * `src/features/venue/venue-invoices.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <VenueInvoices />;
}
