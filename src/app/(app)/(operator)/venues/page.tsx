'use client';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { VenuesTable } from '@/features/venues/venues-table';

/** `'use client'` — `operatorId` only exists client-side via `useSession()`, same shape as
 * `(operator)/settings/page.tsx`. */
export default function VenuesPage() {
  const { claims, isPlatformAdmin } = useSession();
  const operatorId = claims?.operatorId;
  // final-review.md F4: venue create is isAdmin+ (owner/admin) per firestore.rules — a lead reaching
  // this page (MANAGER_ROLES-gated by the shell) shouldn't see an action that `/venues/new`'s own
  // page-level gate would just bounce them out of.
  const canCreate = isPlatformAdmin || (claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Venues"
        description="Every location this operator runs valet at — zones, rates, SMS templates, and QR signage."
        actions={
          canCreate ? (
            <Link href="/venues/new">
              <Button icon={<Plus className="h-4 w-4" />} iconPosition="left">
                New venue
              </Button>
            </Link>
          ) : undefined
        }
      />
      {operatorId ? (
        <VenuesTable operatorId={operatorId} />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
