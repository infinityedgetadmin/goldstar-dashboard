'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { multiFactor } from 'firebase/auth';
import { firebase } from '@/lib/firebase/client';
import { useSession } from '../use-session';
import { EnrollTotpDialog } from './enroll-totp-dialog';

/**
 * MFA enforcement gate (spec §6 Step 3, task-2-brief.md): when the
 * operator's `security.requireMfaForAdmins` is on and the signed-in user
 * holds owner/admin but has no enrolled TOTP factor, this renders ONLY
 * the enrollment dialog — `children` never mount until enrollment
 * completes. Extracted out of `(operator)/layout.tsx` (rather than
 * inlined there) so this gate is directly unit-testable without mounting
 * the whole route's layout tree.
 *
 * `EnrollTotpDialog`'s Cancel/close (X) both route through its
 * `onOpenChange` prop, which is a deliberate no-op here — there is no
 * way to dismiss this without enrolling. That leaves those two controls
 * visibly inert rather than removed, a known rough edge (disclosed in
 * task-2-report.md): `DialogContent`'s close button is baked into the
 * shared `ui/dialog.tsx` primitive used across the whole app, and adding
 * a per-instance "hide the X" prop to a shared UI-kit component wasn't
 * worth it for this one enforcement screen.
 *
 * Fix round 1 (Major, task-2-review.md): `enrolledCount` MUST be known
 * before the first commit, not derived in a `useEffect` — otherwise the
 * component's very first render (before that effect's passive-effect
 * flush) sees `enrolledCount === null`, `mustEnroll` evaluates `false`,
 * and `children` — the real protected page and whatever data-fetching
 * effects it starts — mounts for one tick before the correction lands.
 * `multiFactor(user).enrolledFactors` is a synchronous SDK read (no
 * network call), so there's no reason it needs to wait for an effect at
 * all: a lazy `useState` initializer runs during render, before the
 * initial paint, closing the gap entirely. The effect is kept only to
 * recompute this if `currentUser`'s identity changes later (e.g. after
 * `assumeOperator`'s fresh `onAuthStateChanged` event) without needing a
 * full remount.
 */
export function MfaEnforcementGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const currentUser = firebase().auth.currentUser;
  const [enrolledCount, setEnrolledCount] = useState<number | null>(() =>
    currentUser ? multiFactor(currentUser).enrolledFactors.length : null
  );

  useEffect(() => {
    setEnrolledCount(currentUser ? multiFactor(currentUser).enrolledFactors.length : null);
  }, [currentUser]);

  const requiresMfa = session.operator?.security?.requireMfaForAdmins === true;
  const isManager = session.claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false;
  const mustEnroll = requiresMfa && isManager && enrolledCount === 0;

  if (mustEnroll && currentUser) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-secondary p-6">
        <EnrollTotpDialog user={currentUser} open onOpenChange={() => {}} onEnrolled={() => setEnrolledCount(1)} />
      </div>
    );
  }

  return <>{children}</>;
}
