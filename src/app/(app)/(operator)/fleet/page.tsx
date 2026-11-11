'use client';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { FleetTable } from '@/features/fleet/fleet-table';

/**
 * Fleet route (Plan 5 Task 4) — vehicle CRUD for dispatch's fleet-vehicle picker (`FleetPicker`,
 * `src/features/dispatch/fleet-picker.tsx`). `'use client'` — `operatorId` only exists client-side
 * via `useSession()`, same shape as `venues/page.tsx`/`dispatch/page.tsx`.
 */
export default function FleetPage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;

  return (
    <div className="space-y-6">
      <PageHeader title="Fleet" description="Vehicles available for ride and chase-driver assignment." />
      {operatorId ? (
        <FleetTable operatorId={operatorId} />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
