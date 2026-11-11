'use client';
import { useMemo } from 'react';
import { limit, type QueryConstraint } from 'firebase/firestore';
import { useCollection } from '@/lib/firebase/hooks';

/**
 * Cheap "does this collection have at least one document" check for the first-run
 * checklist and the settings form's currency-lock check.
 *
 * Bundle-safety note (Plan 4a Task 4 controller ruling): `src/lib/firebase/hooks.ts`'s
 * `useCollection` already imports `query`/`QueryConstraint` from `firebase/firestore` —
 * that import predates this task and has zero importers anywhere in the repo today
 * (confirmed by grep), so it currently contributes nothing to any bundle. Becoming its
 * first consumer here is safe for `check:guest-bundle` specifically because that hook,
 * and everything under `src/features/settings/`, is only ever imported from
 * `src/app/(operator)/**` — a route group with no shared component tree with
 * `src/app/(public)/**`, so Next.js's per-route code splitting never pulls it into the
 * guest bundle. Verified empirically with `npm run build && npm run check:guest-bundle`
 * after this file was wired up (see task-4-report.md), not assumed from this reasoning
 * alone.
 *
 * `limit(1)` caps what's actually streamed to the client to a single document
 * regardless of how large the real collection is (an operator can have thousands of
 * tickets) — deliberately cheaper than a bare `onSnapshot(collection(...))` with no
 * constraint, which `useCollection` would otherwise stream in full.
 */
export function useCollectionExists(path: string | undefined): { exists: boolean; loading: boolean } {
  const constraints = useMemo<QueryConstraint[]>(() => [limit(1)], []);
  const { data, loading } = useCollection(path, constraints);
  return { exists: data.length > 0, loading };
}
