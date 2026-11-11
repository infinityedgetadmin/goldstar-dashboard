'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { BrandingEditor } from '@/features/branding/branding-editor';

/**
 * Sign-off micro-fix round (final-review.md "Re-review (final wave)"): same admin+ page-level gate
 * pattern as `(operator)/venues/new/page.tsx` — `OperatorGate` at the shell level only requires
 * MANAGER_ROLES (owner/admin/lead), but firestore.rules' operators/{op} update rule only admits
 * owner (full write) or admin (branding-only, Ruling E-4a) — never lead. nav.ts already hides
 * Branding from a lead, but nav hiding is cosmetic; a lead URL-navigating here directly is now
 * redirected to `/no-access` before the editor renders.
 */
export default function BrandingPage() {
  const { claims, isPlatformAdmin, status } = useSession();
  const router = useRouter();
  const canAccess = isPlatformAdmin || (claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  return (
    <div className="space-y-6">
      <PageHeader title="Branding" description="Colors, logos, and how guests see your brand." />
      {canAccess ? (
        <BrandingEditor />
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
