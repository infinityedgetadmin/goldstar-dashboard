'use client';
import { VenueReports } from '@/features/venue/venue-reports';

/**
 * Plan 7 Task 1b: thin route wrapper — the real reports feature lives in
 * `src/features/venue/venue-reports.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <VenueReports />;
}
