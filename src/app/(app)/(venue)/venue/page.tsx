'use client';
import { LiveBoard } from '@/features/venue/live-board';

/**
 * Plan 7 Task 1b: thin route wrapper — the real live board feature lives in
 * `src/features/venue/live-board.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <LiveBoard />;
}
