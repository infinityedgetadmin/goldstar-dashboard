'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { VenueForm } from '@/features/venues/venue-form';

/**
 * final-review.md F4: page-level admin+ gate. `(operator)/layout.tsx`'s `OperatorGate` admits any
 * MANAGER_ROLES member (owner/admin/lead) into the whole `(operator)` shell, but firestore.rules'
 * venue create rule requires `isAdmin()` (owner/admin — NOT lead). Without this gate a lead who
 * URL-navigates here could fill out the whole form only to have the create() denied by rules on
 * submit. `/venues`' own "New venue" button is now hidden from a lead too (same list page), but
 * nav/button hiding is cosmetic on its own — this page-level gate is the actual enforcement.
 */
export default function NewVenuePage() {
  const { claims, operator, isPlatformAdmin, status } = useSession();
  const router = useRouter();
  const operatorId = claims?.operatorId;
  const canAccess = isPlatformAdmin || (claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  return (
    <div className="space-y-6">
      <PageHeader title="New venue" description="Add a location — zones, rates, and SMS templates come next." />
      {canAccess && operatorId && operator ? (
        <VenueForm operatorId={operatorId} currency={operator.currency} />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
