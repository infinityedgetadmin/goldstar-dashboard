'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, limit, updateDoc } from 'firebase/firestore';
import type { Operator } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useCollection } from '@/lib/firebase/hooks';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useCollectionExists } from './use-collection-exists';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { CheckCircle2, Circle } from 'lucide-react';

export interface FirstRunChecklistProps {
  operatorId: string;
  operator: Operator;
}

/**
 * `onboarding.completedAt` isn't part of the installed `@goldstar/platform` `Operator` type
 * (verified against `operatorSchema` — no `onboarding` field exists in the pinned v0.3.5
 * contract). `firestore.rules`' owner-update rule has no `hasOnly()` key restriction — it only
 * pins specific EXISTING fields (`id`/`slug`/`status`/`plan`/`isSandbox`/`createdAt`/`createdBy`
 * plus 4 nested `modules.payments.*` fields) — so an owner adding this new top-level field is
 * rules-permitted. The type gap is bridged locally here rather than editing the pinned vendored
 * contracts package, which this task was told to verify-and-code-to-exactly, not extend.
 * Disclosed in task-4-report.md as a real gap a future contracts bump should close properly.
 */
type OperatorWithOnboarding = Operator & { onboarding?: { completedAt?: string } };

interface VenueRow {
  rates?: { valet?: { items?: unknown[] } };
}

const VENUE_LIMIT = [limit(5)];
const USERS_LIMIT = [limit(2)];

/**
 * First-run checklist (spec §2.4) — rendered while `operators/{id}.onboarding.completedAt` is
 * unset. Every item is computed LIVE from real Firestore state (`onSnapshot`, never a one-time
 * read) via the same bundle-safe `useCollection`/`useCollectionExists` pattern used elsewhere in
 * this task — see `use-collection-exists.ts`'s header comment for why that's safe for
 * `check:guest-bundle`.
 *
 * Mounted on `(operator)/home/page.tsx` (F6, final-review.md) — matching spec §2.4's original
 * intent. It was temporarily mounted on the Settings page instead when this was first built (no
 * `(operator)/home` page existed yet); Settings now just links to Home for anyone who lands there
 * looking for it.
 */
export function FirstRunChecklist({ operatorId, operator }: FirstRunChecklistProps) {
  const op = operator as OperatorWithOnboarding;
  const [dismissing, setDismissing] = useState(false);
  const [chargesEnabled, setChargesEnabled] = useState<boolean | null>(null);

  const connectedAccountId = operator.modules.payments.connectedAccountId;
  useEffect(() => {
    if (!connectedAccountId) return;
    let cancelled = false;
    // `connectAccountStatus` now has a real Functions handler (Plan 4b Task 6) — `connectedAccountId`'s
    // mere presence stays the fallback signal below for a genuine call failure only.
    callable('connectAccountStatus')({})
      .then((res) => {
        if (!cancelled) setChargesEnabled(res.chargesEnabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connectedAccountId]);

  const { data: venues, loading: venuesLoading } = useCollection<VenueRow>(`operators/${operatorId}/venues`, VENUE_LIMIT);
  const { exists: hasKeyTags, loading: keyTagsLoading } = useCollectionExists(`operators/${operatorId}/keyTags`);
  const { data: users, loading: usersLoading } = useCollection(`operators/${operatorId}/users`, USERS_LIMIT);

  if (op.onboarding?.completedAt) return null;

  const venueCreated = venues.length > 0;
  // Heuristic, disclosed: `rates` is a required field on every venue doc (venueSchema), so its
  // mere presence can't distinguish "rates configured" from "venue just scaffolded with empty
  // placeholder rates" — this checks for at least one actual valet rate line item instead.
  const ratesSet = venues.some((v) => (v.rates?.valet?.items?.length ?? 0) > 0);
  // Heuristic, disclosed: "staff invited" has no dedicated counter on the operator doc. The owner's
  // own user doc is created alongside the operator, so > 1 user document is used as a proxy for
  // "at least one other person has been added" rather than a literal invitation-sent count.
  const staffInvited = users.length > 1;
  const stripeConnected = chargesEnabled ?? Boolean(connectedAccountId);
  const messagingSet = Boolean(operator.modules.messaging.messagingServiceSid);
  const schedulingChosen = operator.modules.scheduling.provider !== 'internal';

  const items: { key: string; label: string; href: string; done: boolean; loading: boolean }[] = [
    { key: 'venue', label: 'Create your first venue', href: '/venues', done: venueCreated, loading: venuesLoading },
    { key: 'rates', label: 'Set valet rates', href: '/venues', done: ratesSet, loading: venuesLoading },
    { key: 'keytags', label: 'Generate key tags', href: '/venues', done: hasKeyTags, loading: keyTagsLoading },
    { key: 'staff', label: 'Invite your staff', href: '/staff', done: staffInvited, loading: usersLoading },
    { key: 'stripe', label: 'Connect Stripe for payments', href: '/settings', done: stripeConnected, loading: false },
    { key: 'messaging', label: 'Set up guest text messaging', href: '/settings', done: messagingSet, loading: false },
    { key: 'scheduling', label: 'Choose a scheduling provider', href: '/settings', done: schedulingChosen, loading: false },
  ];

  const remaining = items.filter((i) => !i.done).length;

  const handleDismiss = async () => {
    setDismissing(true);
    try {
      const { db } = firebase();
      await updateDoc(doc(db, `operators/${operatorId}`), { 'onboarding.completedAt': new Date().toISOString() });
    } catch (err) {
      toast.error(err);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Get set up</CardTitle>
          <Text size="xs" color="tertiary">
            {remaining === 0 ? 'All set' : `${remaining} remaining`}
          </Text>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.key}>
              <Link href={item.href} className="flex min-h-11 items-center gap-2 rounded-lg px-1 hover:bg-bg-secondary">
                {item.done ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" aria-hidden />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden />
                )}
                <Text size="sm" color={item.done ? 'tertiary' : 'primary'} className={item.done ? 'line-through' : undefined}>
                  {item.label}
                  {item.loading ? '…' : ''}
                </Text>
              </Link>
            </li>
          ))}
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={handleDismiss} loading={dismissing}>
          Dismiss
        </Button>
      </CardContent>
    </Card>
  );
}
