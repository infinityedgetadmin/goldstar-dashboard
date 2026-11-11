'use client';
import type { User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useDoc, useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { StatusPill } from '@/components/ui/status-pill';
import { UserEditor } from './user-editor';
import { CredentialsPanel } from './credentials-panel';

export interface StaffDetailProps {
  uid: string;
}

/**
 * Staff detail/edit page content — mirrors `venue-detail.tsx`'s shape (live `useDoc`, not a one-shot
 * read; `PageHeader` + feature panels underneath). Added beyond the brief's literal file list for the
 * same reason `venue-detail.tsx` exists alongside `venue-form.tsx`: `[uid]/page.tsx` needs somewhere
 * to compose `UserEditor` + `CredentialsPanel` with the live user doc, and a Next.js server page
 * component can't itself call client hooks (`useSession`/`useDoc`).
 */
export function StaffDetail({ uid }: StaffDetailProps) {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;
  const { data: user, loading: userLoading, error: userError } = useDoc<User>(operatorId ? `operators/${operatorId}/users/${uid}` : undefined);
  const { data: venues, loading: venuesLoading } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);

  if (!operatorId || userLoading || venuesLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Staff member" description="Loading…" />
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      </div>
    );
  }

  if (userError || !user) {
    return <EmptyState title="Staff member not found" description="This person doesn't exist or couldn't be loaded." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.displayName}
        description={user.email}
        actions={<StatusPill label={user.status} tone={user.status === 'active' ? 'positive' : user.status === 'suspended' ? 'negative' : 'info'} />}
      />
      <UserEditor operatorId={operatorId} user={user} venues={venues} />
      <CredentialsPanel operatorId={operatorId} uid={user.uid} credentials={user.credentials} />
    </div>
  );
}
