'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { StaffTable } from '@/features/staff/staff-table';
import { InviteDialog, type InviteResult } from '@/features/staff/invite-dialog';

/**
 * `'use client'` — `operatorId` only exists client-side via `useSession()`, same shape as
 * `(operator)/venues/page.tsx`.
 *
 * Pending-invite tracking (resend/revoke) is deliberately SESSION-LOCAL, not backed by a live
 * Firestore query — disclosed gap (task-6-report.md): `firestore.rules`' top-level `invitations/{id}`
 * collection is `allow read, write: if false` (Functions-only, confirmed against the goldstar-platform
 * repo directly — `test/rules/11-staff-collections.test.ts` already asserts this), and the contract
 * has no `identityListInvitations`-style callable. So there is no way for the dashboard to learn about
 * a PRIOR session's still-pending invitations at all; the only inviteId this page ever sees is the one
 * `identityInvite` just returned. `InviteDialog`'s `onInvited` callback feeds this in-memory list, which
 * IS wired to the real `identityInvite`/`identityRevokeInvitation` callables (not a mock) — it just
 * doesn't survive a reload. A future task should either add a list callable or extend the rule for an
 * admin-scoped, id-and-email-only read.
 */
export default function StaffPage() {
  const { claims } = useSession();
  const operatorId = claims?.operatorId;
  const { data: venues } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pending, setPending] = useState<InviteResult[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const handleResend = async (invite: InviteResult) => {
    setBusyInviteId(invite.inviteId);
    try {
      const identityInvite = callable('identityInvite');
      const out = await identityInvite({ email: invite.email, roles: invite.roles, venueIds: invite.venueIds, ...(invite.displayName ? { displayName: invite.displayName } : {}) });
      toast.success('Invitation sent');
      setPending((prev) => [...prev.filter((p) => p.inviteId !== invite.inviteId), { ...invite, inviteId: out.inviteId }]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyInviteId(null);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setBusyInviteId(inviteId);
    try {
      const identityRevokeInvitation = callable('identityRevokeInvitation');
      await identityRevokeInvitation({ inviteId });
      toast.success('Invitation revoked.');
      setPending((prev) => prev.filter((p) => p.inviteId !== inviteId));
    } catch (e) {
      toast.error(e);
    } finally {
      setBusyInviteId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff"
        description="Everyone with dashboard access at this operator — roles, venues, and drive-home eligibility."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={() => setInviteOpen(true)}>
            Invite staff
          </Button>
        }
      />
      {operatorId ? (
        <>
          <StaffTable operatorId={operatorId} venues={venues} />
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending invitations (this session)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Text size="xs" color="tertiary">
                  Invitations you send are only listed here until you leave this page.
                </Text>
                {pending.map((invite) => (
                  <div key={invite.inviteId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <Text size="sm">{invite.email}</Text>
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" loading={busyInviteId === invite.inviteId} onClick={() => handleResend(invite)}>
                        Resend
                      </Button>
                      <Button variant="danger" size="sm" loading={busyInviteId === invite.inviteId} onClick={() => handleRevoke(invite.inviteId)}>
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} venues={venues} onInvited={(result) => setPending((prev) => [...prev, result])} />
        </>
      ) : (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      )}
    </div>
  );
}
