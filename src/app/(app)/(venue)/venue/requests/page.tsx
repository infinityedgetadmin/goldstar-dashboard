'use client';
import { VenueRequests } from '@/features/venue/venue-requests';

/**
 * Plan 7 Task 1b: thin route wrapper — the real requests feature lives in
 * `src/features/venue/venue-requests.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <VenueRequests />;
}
