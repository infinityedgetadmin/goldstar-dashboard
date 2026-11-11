'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { MapPin, PowerOff } from 'lucide-react';
import type { Operator, Role } from '@goldstar/platform';
import { SessionProvider } from '@/features/auth/session-provider';
import { useSession } from '@/features/auth/use-session';
import { SessionErrorScreen } from '@/features/auth/session-error';
import { MfaEnforcementGate } from '@/features/auth/mfa/mfa-enforcement-gate';
import { AppShell } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { venueNav } from '@/lib/nav';
import { VenueProvider, useVenue } from '@/features/venue/venue-context';
import { VenueSwitcher } from '@/features/venue/venue-switcher';
import { useClaimVenues } from '@/features/venue/use-claim-venues';

/**
 * Venue portal shell (Plan 7 Task 1) — the restaurant/hotel host's surface:
 * live board, host requests, validations, reports, invoices, staffing.
 *
 * NESTED under `(app)`, not a third top-level root layout (controller
 * Ruling A). This repo has exactly two root layouts — `(public)` and
 * `(app)` — and every route must resolve to one of them (see this repo's
 * the project notes, "Root layouts (two, not one)"). A `src/app/(venue)/` group
 * would have been a third root, which also puts it OUTSIDE `Providers`:
 * React Query and Sonner would be missing from every venue screen — a
 * silent runtime failure rather than a build error. As a peer of
 * `(operator)`/`(platform)` it inherits `(app)`'s root layout and
 * `Providers`; the URLs are `/venue/*` either way, since route groups don't
 * appear in the path.
 *
 * `SessionProvider` is mounted here rather than in the shared root
 * `Providers` — see `(auth)/layout.tsx`'s header comment for why (guest
 * bundle budget), same as `(operator)/layout.tsx` and
 * `(platform)/layout.tsx`.
 */
export default function VenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <VenueGate>{children}</VenueGate>
    </SessionProvider>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg-secondary">
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    </div>
  );
}

/**
 * Access gate, mirroring `(operator)/layout.tsx`'s `OperatorGate` exactly:
 * signed out -> `/sign-in?next=…`; signed in without access -> `/no-access`.
 * "With access" means an operator-scoped session that either holds
 * `venue_user` or is a platform admin — the same `session.isPlatformAdmin`
 * bypass the operator shell uses for an assumed platform admin, not a
 * second mechanism.
 */
function VenueGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const hasVenueAccess =
    !!session.claims?.operatorId &&
    (session.isPlatformAdmin || (session.claims?.roles.includes('venue_user') ?? false));

  useEffect(() => {
    if (session.status === 'error') return; // carry #43: a load failure is not a sign-out — see below
    if (session.status === 'signed_out') {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    } else if (session.status === 'signed_in' && !hasVenueAccess) {
      router.replace('/no-access');
    }
  }, [session.status, hasVenueAccess, router, pathname]);

  // Carry #43: a failed session load gets its OWN screen, ahead of the skeleton. It used to fall
  // through to `ShellSkeleton` and spin forever — the failure was indistinguishable from a slow
  // load because nothing ever reported it. Deliberately checked BEFORE the access guard: a user
  // whose operator document failed to load has unknown access, and answering "no access" would be
  // a guess presented as a fact.
  if (session.status === 'error') {
    return <SessionErrorScreen />;
  }

  if (session.status !== 'signed_in' || !hasVenueAccess) {
    return <ShellSkeleton />;
  }

  return (
    <MfaEnforcementGate>
      <VenueShell>{children}</VenueShell>
    </MfaEnforcementGate>
  );
}

/**
 * The shell proper. Split out of `VenueGate` so `useClaimVenues` only ever
 * subscribes for a session that actually passed the gate.
 *
 * Branding comes from `session.operator` via `AppShell` — the operator's
 * display name in the sidebar and their brand colors through
 * `operatorThemeVars`, exactly the same source the operator shell uses. A
 * host sees the valet company's brand, not a per-venue one.
 */
function VenueShell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const { venues, loading } = useClaimVenues(session.claims?.operatorId, session.claims?.venueIds);

  // `session.operator` arrives on its own Firestore listener, which can settle
  // AFTER `status` flips to `signed_in` (see `session-provider.tsx`). Treat
  // "not loaded yet" as loading, never as "feature disabled" — otherwise the
  // portal flashes "not enabled" at a host whose operator has it on.
  const operatorLoaded = session.operator !== undefined;
  const portalsEnabled = session.operator?.features?.venuePortals === true;
  const isPlatformAdmin = session.isPlatformAdmin;

  return (
    <VenueProvider
      venues={venues}
      loading={loading}
      storageKey={session.uid ? `gs:venue:selected:${session.uid}` : undefined}
    >
      <VenueFrame
        roles={session.claims?.roles ?? []}
        operator={session.operator}
        showSwitcher={portalsEnabled}
      >
        {!operatorLoaded || loading ? (
          <Text size="sm" color="tertiary">
            Loading…
          </Text>
        ) : !portalsEnabled ? (
          // Ruling: a disabled `venuePortals` flag is an explicit, readable
          // state — NOT a `/no-access` redirect and NOT a half-working portal.
          // A `venue_user` has no other surface in this app, so a bare lockout
          // would be indistinguishable from a bug.
          <div className="space-y-6">
            <PageHeader title="Venue portal" description="Requests, validations and reporting for your venue." />
            <EmptyState
              icon={<PowerOff />}
              title="Venue portal isn't enabled"
              description={`${session.operator?.branding.displayName ?? 'Your valet operator'} hasn't turned on venue portals yet. Ask them to enable it, and this is where your live board, requests and validations will appear.`}
            />
          </div>
        ) : venues.length === 0 ? (
          <div className="space-y-6">
            <PageHeader title="Venue portal" description="Requests, validations and reporting for your venue." />
            {isPlatformAdmin ? (
              // Platform admins carry no `venueIds` — `identityAssumeOperator`
              // mints an empty list deliberately, and broadening that token to
              // fill this screen would be the wrong trade. Say so plainly and
              // point at the shell that does serve them.
              <EmptyState
                icon={<MapPin />}
                title="No venue assignments on this account"
                description="Platform admins aren't assigned to venues, so there's nothing to show here. Use the operator dashboard to see this operator's venues and live activity."
                action={
                  <Link href="/home">
                    <Button variant="secondary">Go to the operator dashboard</Button>
                  </Link>
                }
              />
            ) : (
              <EmptyState
                icon={<MapPin />}
                title="No venue assigned"
                description="Your account isn't linked to a venue yet. Ask your valet operator to add you to one."
              />
            )}
          </div>
        ) : (
          children
        )}
      </VenueFrame>
    </VenueProvider>
  );
}

/**
 * Renders the shell from INSIDE `VenueProvider`, because the nav now depends on the SELECTED
 * venue: "Hotel" appears only for a venue with a PMS configured (`venueNav`). That is per-venue
 * state, so it cannot be resolved in `VenueShell`, which sits above the provider and knows only
 * the claim's venue LIST — not which one is active.
 */
function VenueFrame({
  roles,
  operator,
  showSwitcher,
  children,
}: {
  roles: Role[];
  operator: Operator | undefined;
  showSwitcher: boolean;
  children: React.ReactNode;
}) {
  const { venue } = useVenue();
  return (
    <AppShell
      nav={venueNav(Boolean(venue?.pms))}
      roles={roles}
      operator={operator}
      toolbar={showSwitcher ? <VenueSwitcher /> : null}
    >
      {children}
    </AppShell>
  );
}
