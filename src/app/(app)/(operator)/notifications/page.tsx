'use client';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Text } from '@/components/ui/typography';
import { NotificationPrefsForm } from '@/features/notifications/notification-prefs-form';

/**
 * Task 8 (task-89-report.md): self-service notification preferences. Deliberately no page-level
 * role gate beyond `(operator)/layout.tsx`'s own `OperatorGate` (owner/admin/lead, or an assumed
 * platform admin) — unlike `/settings`, `/integrations`, `/audit`, this page only ever writes the
 * SIGNED-IN user's own `notificationPrefs` (firestore.rules' `request.auth.uid == uid` branch), so
 * there's no "reaches the page, every save 403s" failure mode a narrower role gate would be
 * protecting against. `nav.ts` doesn't list it (no natural spot in the existing sidebar sections for
 * a personal-settings page) — reachable by direct navigation, same as `/no-access` itself.
 */
export default function NotificationsPage() {
  const { claims, uid, status } = useSession();
  const operatorId = claims?.operatorId;

  if (status !== 'signed_in' || !operatorId || !uid) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" description="Choose which updates you want to hear about." />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Choose which updates you want to hear about." />
      <NotificationPrefsForm operatorId={operatorId} uid={uid} />
    </div>
  );
}
