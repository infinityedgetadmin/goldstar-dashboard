'use client';
import { StaffingView } from '@/features/venue/staffing-view';

/**
 * Plan 7 Task 1b: thin route wrapper — the real staffing feature lives in
 * `src/features/venue/staffing-view.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <StaffingView />;
}
