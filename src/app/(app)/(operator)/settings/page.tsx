'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { OperatorSettingsForm } from '@/features/settings/operator-settings-form';
import { PaymentsSettings } from '@/features/settings/payments-settings';
import { MessagingSettings } from '@/features/settings/messaging-settings';
import { SchedulingSettings } from '@/features/settings/scheduling-settings';

/**
 * `'use client'` (no static `metadata` export) rather than a server-shell page delegating to a
 * client child — `operatorId`/`operator` only exist client-side via `useSession()`
 * (`(operator)/layout.tsx`'s `SessionProvider`), and every section below needs both as props.
 *
 * Ruling E-4a (final-review F4): page-level owner gate. `(operator)/layout.tsx`'s `OperatorGate`
 * admits any MANAGER_ROLES member (owner/admin/lead) into the whole `(operator)` shell — nav.ts
 * hiding Settings from admin/lead is cosmetic only, so a lead who URL-navigates here directly would
 * otherwise reach a page whose every write (operator-settings-form.tsx, payments-settings.tsx,
 * messaging-settings.tsx, scheduling-settings.tsx) firestore.rules denies for anyone but
 * owner/platform_admin. Redirects non-owner, non-platform_admin viewers to `/no-access` instead of
 * letting them load a page that 100%-fails every save.
 */
export default function SettingsPage() {
  const { claims, operator, isPlatformAdmin, status } = useSession();
  const router = useRouter();
  const operatorId = claims?.operatorId;
  const canAccess = isPlatformAdmin || (claims?.roles.includes('owner') ?? false);

  useEffect(() => {
    if (status === 'signed_in' && !canAccess) {
      router.replace('/no-access');
    }
  }, [status, canAccess, router]);

  if (!canAccess || !operatorId || !operator) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" description="Operator configuration, payments, messaging, and scheduling." />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Operator configuration, payments, messaging, and scheduling." />
      {/* F6 (final-review.md): the first-run checklist moved to /home (spec §2.4's original intent —
          see first-run-checklist.tsx's header comment). Trivial link kept here for anyone who lands
          on Settings directly and is looking for it. */}
      <Text size="sm" color="tertiary">
        Looking for the setup checklist? It moved to{' '}
        <Link href="/home" className="text-primary-500 hover:underline">
          Home
        </Link>
        .
      </Text>
      <OperatorSettingsForm operatorId={operatorId} operator={operator} />
      <PaymentsSettings operator={operator} />
      <MessagingSettings operatorId={operatorId} operator={operator} />
      <SchedulingSettings operatorId={operatorId} operator={operator} />
    </div>
  );
}
