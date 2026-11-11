'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { SessionProvider } from '@/features/auth/session-provider';
import { useSession } from '@/features/auth/use-session';
import { SessionErrorScreen } from '@/features/auth/session-error';
import { AppShell } from '@/components/layout/app-shell';
import { Text } from '@/components/ui/typography';
import { PLATFORM_NAV } from '@/lib/nav';

/**
 * `SessionProvider` mounted here rather than the shared root
 * `Providers` — see `(auth)/layout.tsx`'s header comment for why
 * (guest bundle budget).
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlatformGate>{children}</PlatformGate>
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

function PlatformGate({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === 'error') return; // carry #43: a load failure is not a sign-out — see below
    if (session.status === 'signed_out') {
      router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    } else if (session.status === 'signed_in' && !session.isPlatformAdmin) {
      router.replace('/no-access');
    }
  }, [session.status, session.isPlatformAdmin, router, pathname]);

  // Carry #43: a failed session load gets its OWN screen, ahead of the skeleton. It used to fall
  // through to `ShellSkeleton` and spin forever — the failure was indistinguishable from a slow
  // load because nothing ever reported it. Deliberately checked BEFORE the access guard: a user
  // whose operator document failed to load has unknown access, and answering "no access" would be
  // a guess presented as a fact.
  if (session.status === 'error') {
    return <SessionErrorScreen />;
  }

  if (session.status !== 'signed_in' || !session.isPlatformAdmin) {
    return <ShellSkeleton />;
  }

  return (
    <AppShell nav={PLATFORM_NAV} roles={session.claims?.roles ?? []} operator={session.operator}>
      {children}
    </AppShell>
  );
}
