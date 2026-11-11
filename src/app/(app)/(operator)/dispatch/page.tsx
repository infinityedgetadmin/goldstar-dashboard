'use client';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { DispatchBoard } from '@/features/dispatch/dispatch-board';

/**
 * Dispatch route (Plan 5 Task 4) — `nav.ts` already registers `{ label: 'Dispatch', href:
 * '/dispatch', features: ['driveHome', 'passengerRides'] }` (landed with Plan 4a's nav; this is
 * the first task to actually fill the route in). `'use client'` — `operatorId` only exists
 * client-side via `useSession()`, same shape as `live/page.tsx`/`fleet/page.tsx`.
 */
export default function DispatchPage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;

  return (
    <div className="space-y-6">
      <PageHeader title="Dispatch" description="Drive-home and ride requests, live — assign drivers, re-quote, and cancel." />
      {operatorId ? (
        <DispatchBoard operatorId={operatorId} />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
