'use client';
import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { toast } from '@/lib/toast';
import { AuditFilters } from '@/features/audit/audit-filters';
import { AuditTable } from '@/features/audit/audit-table';
import { useAuditQuery } from '@/features/audit/use-audit-query';
import { auditEntriesToCsv, downloadCsv } from '@/features/audit/csv-export';

/**
 * Task 8 (task-89-report.md): audit viewer. `nav.ts`'s `Audit` entry is already owner/admin-gated
 * (cosmetic only, same caveat as `settings/page.tsx`/`integrations/page.tsx`) — page-level redirect
 * added here for the same reason those two have one: `auditQuery`'s own role gate
 * (`goldstar-platform`'s `functions/src/modules/audit/query.ts`) is owner/admin/platform_admin, a
 * `lead` reaching this page via direct navigation would get `permission_denied` on every search.
 */
export default function AuditPage() {
  const { claims, isPlatformAdmin, status } = useSession();
  const router = useRouter();
  const operatorId = claims?.operatorId;
  const canAccess = isPlatformAdmin || (claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);

  const { data: staff, loading: staffLoading } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);
  const staffByUid = useMemo(() => new Map(staff.map((u) => [u.uid, u])), [staff]);
  const { entries, loading, hasSearched, search } = useAuditQuery();

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  const exportCsv = () => {
    if (entries.length === 0) {
      toast.info('No results to export yet.');
      return;
    }
    downloadCsv(auditEntriesToCsv(entries, staffByUid), `audit-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  if (!canAccess || !operatorId || staffLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="Who changed what, and when." />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Who changed what, and when."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={entries.length === 0}>
            Export CSV
          </Button>
        }
      />
      <AuditFilters staff={staff} onSearch={search} />
      <AuditTable entries={entries} staffByUid={staffByUid} loading={loading} hasSearched={hasSearched} />
    </div>
  );
}
