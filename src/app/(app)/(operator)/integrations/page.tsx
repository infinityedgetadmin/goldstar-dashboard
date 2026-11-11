'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { IntegrationsGrid } from '@/features/integrations/integrations-grid';

/**
 * Task 8 (task-89-report.md): manifest-driven Integrations page — `nav.ts` already gates this route
 * to owner/admin (`Integrations` entry, `roles: [...OWNER_ADMIN]`), but that's cosmetic only (same
 * as `settings/page.tsx`'s own header comment explains for Settings) — `(operator)/layout.tsx`'s
 * `OperatorGate` admits any manager (owner/admin/lead). Every write this page can trigger
 * (`integrationsSetSecret`, the direct `integrations/{id}.config` / `venues/{id}.pms|pos` writes)
 * is owner/platform_admin-only per firestore.rules — a lead reaching this page would see a page that
 * loads fine but fails every save. Page-level redirect, same pattern as Settings.
 */
export default function IntegrationsPage() {
  const { claims, operator, isPlatformAdmin, status } = useSession();
  const router = useRouter();
  const operatorId = claims?.operatorId;
  const canAccess = isPlatformAdmin || (claims?.roles.includes('owner') ?? false) || (claims?.roles.includes('admin') ?? false);

  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  if (!canAccess || !operatorId || !operator || venuesLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Integrations" description="Providers, credentials, and connection health." />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Integrations" description="Providers, credentials, and connection health." />
      <IntegrationsGrid operatorId={operatorId} operator={operator} venues={venues} />
    </div>
  );
}
