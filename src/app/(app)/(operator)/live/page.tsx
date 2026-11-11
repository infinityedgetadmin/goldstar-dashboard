'use client';
import type { User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { LiveBoard } from '@/features/live/live-board';

/**
 * Live ops route (Ruling B-4b, task-3-brief.md): the brief's own sketch had this at
 * `(operator)/page.tsx` — SUPERSEDED, Plan 4a already landed `/home` as the operator shell's real
 * landing page (welcome + first-run checklist). `nav.ts`'s existing `{ label: 'Live ops', href:
 * '/live' }` entry is what this route fills in; `/home` is untouched.
 *
 * `'use client'` — `operatorId` only exists client-side via `useSession()`, same shape as every
 * other `(operator)` page (`venues/page.tsx`, `staff/page.tsx`).
 */
export default function LivePage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;
  const { data: venues } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staff } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);

  return (
    <div className="space-y-6">
      <PageHeader title="Live ops" description="Every active ticket, right now, across your venues." />
      {operatorId ? (
        <LiveBoard operatorId={operatorId} venues={venues} staff={staff} />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
