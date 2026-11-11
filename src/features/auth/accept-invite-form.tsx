'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { firebase } from '@/lib/firebase/client';
import { callable } from '@/lib/firebase/callables';
import { useSession } from './use-session';
import { sanitizeError } from '@/lib/error-copy';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';

/**
 * Must match the installed `@goldstar/platform` contract exactly.
 * `identityAcceptInvitation`'s input schema requires
 * `password: z.string().min(10).optional()` — verified directly against
 * the installed package (`node_modules/@goldstar/platform`, confirmed at
 * runtime via `callables.identityAcceptInvitation.input.shape.password`)
 * and the source repo's `src/callables.ts`. Not derived from the schema
 * at runtime: zod's `.min()` constraint is only introspectable via its
 * private `_def` internals, not a stable public API, and this package
 * has no separate exported constant for it. If that contract's minimum
 * ever changes, this needs a matching manual update — Fix round 1
 * (task-2-review.md Major): the client previously allowed 6, silently
 * breaking account setup for every 6-9 character password (the callable
 * parses its input before the network call and throws a `ZodError`,
 * which `sanitizeError` can't map to anything but the generic fallback —
 * no indication the password was the problem, no way to succeed by
 * retrying).
 */
const INVITE_PASSWORD_MIN_LENGTH = 10;

/**
 * Invite-acceptance flow: token from the URL -> user sets a password ->
 * `identityAcceptInvitation` callable (verified against the installed
 * `@goldstar/platform` contracts: input `{ token, password?, displayName? }`,
 * output `{ uid, operatorId, email }` — no `customToken` in the response,
 * so the client signs in itself with the email the callable returns and
 * the password the user just set) -> `signInWithEmailAndPassword`.
 * Reads `useSearchParams()` — the page rendering this must wrap it in a
 * `<Suspense>` boundary.
 *
 * Fix round 1 (Minor, task-2-review.md): the backend handler supports a
 * second path — an ALREADY-authenticated caller opening an invite link
 * binds their existing uid to the invite and ignores `password` entirely
 * (e.g. a platform admin, still signed in, following an invite for a
 * second operator). The original version always collected a password and
 * always called `signInWithEmailAndPassword` afterward, which would fail
 * with `auth/wrong-password` for that caller even though the invite had
 * already been accepted server-side — a confusing dead end after a real
 * success. Now branches on `useSession().status`: an already-signed-in
 * caller gets a password-free "accept as {email}" prompt that calls the
 * callable without a password and refreshes claims instead of
 * re-authenticating.
 */
export function AcceptInviteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const token = searchParams.get('token');

  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [awaitingSession, setAwaitingSession] = useState(false);

  useEffect(() => {
    if (awaitingSession && session.status === 'signed_in') {
      // Final whole-branch review, final-wave item 17: '/' was Plan 4a's original placeholder
      // landing route, before /home (welcome + checklist) existed — lands here instead.
      router.replace('/home');
    }
  }, [awaitingSession, session.status, router]);

  if (!token) {
    return (
      <Text size="sm" color="error" role="alert">
        This invitation link is missing its token. Ask your operator admin to resend the invite.
      </Text>
    );
  }

  if (session.status === 'loading') {
    return (
      <Text size="sm" color="tertiary" className="text-center">
        Loading…
      </Text>
    );
  }

  if (session.status === 'signed_in') {
    const handleAcceptForSignedInUser = async (e: FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        await callable('identityAcceptInvitation')({ token });
        await session.refreshClaims();
        // Final whole-branch review, final-wave item 17: '/' was Plan 4a's original placeholder
        // landing route, before /home (welcome + checklist) existed — lands here instead.
        router.replace('/home');
      } catch (err) {
        setError(sanitizeError(err));
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <form onSubmit={handleAcceptForSignedInUser} className="flex flex-col gap-4">
        <Text size="sm" color="secondary">
          You&apos;re already signed in as <strong>{session.email}</strong>. Accept this invitation to add it to
          your account?
        </Text>
        {error && (
          <Text size="sm" color="error" role="alert">
            {error}
          </Text>
        )}
        <Button type="submit" loading={submitting} fullWidth>
          Accept invitation
        </Button>
      </form>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < INVITE_PASSWORD_MIN_LENGTH) {
      setError(`Choose a password with at least ${INVITE_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await callable('identityAcceptInvitation')({
        token,
        password,
        displayName: displayName.trim() || undefined,
      });
      await signInWithEmailAndPassword(firebase().auth, result.email, password);
      setAwaitingSession(true);
    } catch (err) {
      setError(sanitizeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Your name"
        autoComplete="name"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        fullWidth
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        helperText={`At least ${INVITE_PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        fullWidth
      />
      {error && (
        <Text size="sm" color="error" role="alert">
          {error}
        </Text>
      )}
      <Button type="submit" loading={submitting || awaitingSession} fullWidth>
        Accept invitation
      </Button>
    </form>
  );
}
