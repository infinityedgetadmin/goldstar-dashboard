'use client';
import { useCallback, useState } from 'react';
import {
  multiFactor,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  TotpSecret,
  type User as FirebaseUser,
  type MultiFactorError,
  type MultiFactorResolver,
  type UserCredential,
} from 'firebase/auth';
import { firebase } from '@/lib/firebase/client';
import { authErrorCode, authErrorCopy } from '../auth-error-copy';

export type MfaEnrollmentStatus = 'idle' | 'starting' | 'ready' | 'verifying' | 'enrolled' | 'unsupported' | 'error';

/**
 * TOTP enrollment for the signed-in user (spec §6, task-2-brief.md Step
 * 3). API surface verified against the INSTALLED `firebase@12` typings
 * (`node_modules/@firebase/auth/dist/auth-public.d.ts`, resolved via
 * `firebase/node_modules/@firebase/auth`) rather than memory, per this
 * workspace's Context7/external-API rule:
 * `multiFactor(user).getSession()` -> `TotpMultiFactorGenerator
 * .generateSecret(session)` -> `TotpSecret.generateQrCodeUrl(account,
 * issuer)` (returns the full `otpauth://` URL string — no manual
 * key-URI construction needed) -> `TotpMultiFactorGenerator
 * .assertionForEnrollment(secret, code)` -> `multiFactor(user)
 * .enroll(assertion, displayName)`.
 *
 * `auth/operation-not-allowed` (spec's documented gate: MFA requires the
 * Firebase project to be upgraded to Identity Platform, a one-time
 * console action) is treated as a distinct `unsupported` status, not a
 * generic error — the UI shows an honest "not enabled yet" message
 * instead of implying the user did something wrong.
 */
export function useMfaEnrollment(user: FirebaseUser | undefined) {
  const [status, setStatus] = useState<MfaEnrollmentStatus>('idle');
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (!user) return;
    setStatus('starting');
    setError(null);
    try {
      const session = await multiFactor(user).getSession();
      const s = await TotpMultiFactorGenerator.generateSecret(session);
      setSecret(s);
      setStatus('ready');
    } catch (e) {
      if (authErrorCode(e) === 'auth/operation-not-allowed') {
        setStatus('unsupported');
        return;
      }
      setStatus('error');
      setError(authErrorCopy(e));
    }
  }, [user]);

  const verify = useCallback(
    async (code: string) => {
      if (!user || !secret) return;
      setStatus('verifying');
      setError(null);
      try {
        const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
        await multiFactor(user).enroll(assertion, 'Authenticator app');
        setStatus('enrolled');
      } catch (e) {
        setStatus('ready');
        setError(authErrorCopy(e));
      }
    },
    [user, secret]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setSecret(null);
    setError(null);
  }, []);

  const qrCodeUrl = secret ? secret.generateQrCodeUrl(user?.email ?? undefined, 'Goldstar Valet') : undefined;

  return { status, secret, qrCodeUrl, error, start, verify, reset };
}

/**
 * TOTP challenge during sign-in, driven by the `auth/multi-factor-auth-required`
 * error `signInWithEmailAndPassword` throws when the account has an
 * enrolled second factor. Only TOTP hints are supported by this plan
 * (spec §6) — `resolver.hints[0]` is used directly rather than
 * presenting a factor picker, since a user can only ever have one
 * enrolled TOTP factor via this UI's own enrollment flow.
 */
export function useMfaChallenge() {
  const [resolver, setResolver] = useState<MultiFactorResolver | null>(null);
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const beginChallenge = useCallback((mfaError: MultiFactorError) => {
    const r = getMultiFactorResolver(firebase().auth, mfaError);
    setResolver(r);
    setStatus('idle');
    setError(null);
  }, []);

  const submitCode = useCallback(
    async (code: string): Promise<UserCredential | undefined> => {
      if (!resolver) return undefined;
      const hint = resolver.hints[0];
      if (!hint) {
        setError('No second factor is available for this account. Contact your operator admin.');
        return undefined;
      }
      setStatus('verifying');
      setError(null);
      try {
        const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code);
        const cred = await resolver.resolveSignIn(assertion);
        setStatus('idle');
        return cred;
      } catch (e) {
        setStatus('error');
        setError(authErrorCopy(e));
        return undefined;
      }
    },
    [resolver]
  );

  const clear = useCallback(() => {
    setResolver(null);
    setStatus('idle');
    setError(null);
  }, []);

  return { resolver, status, error, beginChallenge, submitCode, clear };
}
