import type { Metadata } from 'next';
import { brand } from '@/config/operators/brand';
import { SessionProvider } from '@/features/auth/session-provider';

/**
 * `SessionProvider` (and everything it pulls in — `firebase/auth`,
 * `firebase/firestore`) is mounted HERE, not in the shared root
 * `src/providers/providers.tsx`. Deliberate deviation from that file's
 * "Task 2 mount point" comment, disclosed in task-2-report.md: the root
 * `Providers` wraps every route including `(public)`, whose first-load
 * JS budget `scripts/check-guest-bundle.mjs` gates at 300 KB gzip (a
 * floor already ~283 KB per that script's own comment). That script's
 * header explicitly anticipates this: "Plan 4a's root-layout restructure
 * re-measures and tightens this." Mounting the session provider
 * per-route-group instead (here, and in `(platform)/layout.tsx` /
 * `(operator)/layout.tsx`) keeps it out of the guest bundle graph
 * entirely, rather than adding to it.
 */
export const metadata: Metadata = {
  title: { default: 'Sign in', template: `%s · ${brand.displayName}` },
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <main className="flex min-h-dvh items-center justify-center bg-bg-secondary px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </SessionProvider>
  );
}
