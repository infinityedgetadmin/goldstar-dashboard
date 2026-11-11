'use client';
import { ValidationsPanel } from '@/features/venue/validations-panel';

/**
 * Plan 7 Task 1b: thin route wrapper — the real validations feature lives in
 * `src/features/venue/validations-panel.tsx` with its own test file, same convention as
 * every other route in this group.
 */
export default function Page() {
  return <ValidationsPanel />;
}
