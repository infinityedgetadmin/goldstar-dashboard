'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword, type MultiFactorError } from 'firebase/auth';
import Link from 'next/link';
import { firebase } from '@/lib/firebase/client';
import { useSession } from './use-session';
import { authErrorCode, authErrorCopy } from './auth-error-copy';
import { MfaChallenge } from './mfa/mfa-challenge';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';

/**
 * Email/password sign-in, with a TOTP challenge step when the account has
 * MFA enrolled (spec §6). Reads `useSearchParams()` — the page rendering
 * this must wrap it in a `<Suspense>` boundary (Next.js requirement for
 * any `useSearchParams()` caller; without it `next build` fails).
 *
 * Redirect timing: after a successful `signInWithEmailAndPassword` (or
 * MFA resolution), this does NOT redirect immediately. `proxy.ts` gates
 * protected routes on the `gs_auth` cookie, which `SessionProvider` only
 * sets once it has fetched custom claims from the new ID token — a race
 * that would otherwise bounce a fresh sign-in straight back to
 * `/sign-in`. Instead it waits for `useSession().status` to reach
 * `signed_in` before navigating.
 */
/** How long to wait for `SessionProvider` to finish after Firebase Auth accepts the credentials,
 * before giving up and saying so. Generous: it covers two Firestore listeners establishing on a
 * cold connection, and only fires when something is genuinely wrong. */
const SESSION_WAIT_TIMEOUT_MS = 20_000;

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const next = searchParams.get('next') || '/home'; // F6 (final-review.md): '/' has no real dashboard content — see (app)/page.tsx's own comment.

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<MultiFactorError | null>(null);
  const [awaitingSession, setAwaitingSession] = useState(false);

  /**
   * Ends the wait. Previously this only handled the happy path, so `awaitingSession` — which drives
   * the submit button's spinner — had exactly one way to clear: reaching `signed_in`. Every other
   * outcome span forever with no message and no recourse: a failed operator/user-doc read leaves
   * `SessionProvider` at `status: 'error'` (see carry #43 in that file), and a claims-read failure
   * leaves it `signed_out`. Both look identical to the person waiting — a spinner that never stops.
   *
   * `signed_out` is treated as a failure only AFTER the provider has been seen leaving `loading`,
   * because the moment sign-in resolves the provider is still on its previous `signed_out` value
   * for a tick; aborting on that would cancel every successful sign-in. The timeout is the
   * backstop for anything neither branch catches (a listener that never fires and never errors).
   */
  useEffect(() => {
    if (!awaitingSession) return;
    if (session.status === 'signed_in') {
      router.replace(next);
      return;
    }
    if (session.status === 'error') {
      setAwaitingSession(false);
      setError('Signed in, but your profile could not be loaded. Please try again, or ask your administrator to check your account.');
      return;
    }
    const timer = setTimeout(() => {
      setAwaitingSession(false);
      setError('Signed in, but loading your account timed out. Please try again.');
    }, SESSION_WAIT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingSession, session.status, router, next]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(firebase().auth, email, password);
      setAwaitingSession(true);
    } catch (err) {
      if (authErrorCode(err) === 'auth/multi-factor-auth-required') {
        setMfaError(err as MultiFactorError);
      } else {
        setError(authErrorCopy(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMfaSuccess = () => {
    setMfaError(null);
    setAwaitingSession(true);
  };

  if (mfaError) {
    return <MfaChallenge mfaError={mfaError} onSuccess={handleMfaSuccess} onCancel={() => setMfaError(null)} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        fullWidth
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        fullWidth
      />
      {error && (
        <Text size="sm" color="error" role="alert">
          {error}
        </Text>
      )}
      <Button type="submit" loading={submitting || awaitingSession} fullWidth>
        Sign in
      </Button>
      <Link href="/forgot-password" className="text-body-sm text-primary-500 text-center hover:underline">
        Forgot password?
      </Link>
    </form>
  );
}
