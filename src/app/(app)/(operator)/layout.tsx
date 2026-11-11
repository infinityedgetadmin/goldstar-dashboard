'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { MANAGER_ROLES } from '@goldstar/platform';
import { SessionProvider } from '@/features/auth/session-provider';
import { useSession } from '@/features/auth/use-session';
import { SessionErrorScreen } from '@/features/auth/session-error';
import { MfaEnforcementGate } from '@/features/auth/mfa/mfa-enforcement-gate';
import { AppShell } from '@/components/layout/app-shell';
import { Text } from '@/components/ui/typography';
import { OPERATOR_NAV } from '@/lib/nav';

/**
 * `SessionProvider` mounted here rather than the shared root
 * `Providers` — see `(auth)/layout.tsx`'s header comment for why
 * (guest bundle budget).
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OperatorGate>{children}</OperatorGate>
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

const MANAGER_ROLE_SET: readonly string[] = MANAGER_ROLES;

function OperatorGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const hasOperatorAccess =
    !!session.claims?.operatorId &&
    (session.isPlatformAdmin || (session.claims?.roles.some((r) => MANAGER_ROLE_SET.includes(r)) ?? false));
  // Sign-in and accept-invite both land on /home. A venue partner belongs in the venue portal
  // (the same check `(venue)/layout.tsx` grants access on), not on "no access".
  const isVenuePartner = !!session.claims?.operatorId && (session.claims?.roles.includes('venue_user') ?? false);

  useEffect(() => {
    if (session.status === 'error') return; // carry #43: a load failure is not a sign-out — see below
    if (session.status === 'signed_out') {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    } else if (session.status === 'signed_in' && !hasOperatorAccess) {
      router.replace(isVenuePartner ? '/venue' : '/no-access');
    }
  }, [session.status, hasOperatorAccess, isVenuePartner, router, pathname]);

  // Carry #43: a failed session load gets its OWN screen, ahead of the skeleton. It used to fall
  // through to `ShellSkeleton` and spin forever — the failure was indistinguishable from a slow
  // load because nothing ever reported it. Deliberately checked BEFORE the access guard: a user
  // whose operator document failed to load has unknown access, and answering "no access" would be
  // a guess presented as a fact.
  if (session.status === 'error') {
    return <SessionErrorScreen />;
  }

  if (session.status !== 'signed_in' || !hasOperatorAccess) {
    return <ShellSkeleton />;
  }

  return (
    <MfaEnforcementGate>
      <AppShell nav={OPERATOR_NAV} roles={session.claims?.roles ?? []} operator={session.operator}>
        {children}
      </AppShell>
    </MfaEnforcementGate>
  );
}
