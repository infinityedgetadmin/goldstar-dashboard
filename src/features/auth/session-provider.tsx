'use client';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  getIdTokenResult,
  signOut as fbSignOut,
  signInWithCustomToken,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Operator, Role, User } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { callable } from '@/lib/firebase/callables';

export interface SessionClaims {
  operatorId?: string;
  roles: Role[];
  venueIds: string[];
  claimsVersion: number;
  assumed?: boolean;
}

export interface Session {
  /**
   * `error` (Plan 8 carry #43): a REQUIRED session document failed to load. Entered only from a
   * Firestore `onSnapshot` ERROR callback — never from a timeout, and never from "hasn't arrived
   * yet". That distinction is the whole point: Firestore retries transient/offline conditions
   * internally and does not invoke the error callback for them, so a genuinely slow load keeps
   * reading as `loading` and never flashes an error. Conflating the two in either direction is
   * the bug — a spinner that never resolves on one side, a false alarm on the other.
   */
  status: 'loading' | 'signed_out' | 'signed_in' | 'error';
  uid?: string;
  email?: string;
  claims?: SessionClaims;
  operator?: Operator;
  user?: User;
  isPlatformAdmin: boolean;
  /** Set when the current session is a platform admin assuming this operator (spec §5). */
  assumedOperatorId?: string;
  signOut: () => Promise<void>;
  assumeOperator: (operatorId: string) => Promise<void>;
  leaveAssumed: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  /**
   * Tears down and re-establishes the whole session subscription. The only in-app way out of
   * `status: 'error'` — without it a user whose operator document fails to load has no recourse
   * but to reload the tab, which they have no reason to know will help.
   */
  retry: () => void;
}

export const SessionContext = createContext<Session | null>(null);

/**
 * `Secure` is dropped when the page isn't served over HTTPS (controller
 * carry, task-2-brief.md): some browsers refuse to set a `Secure`-flagged
 * cookie via `document.cookie` on a plain-HTTP origin — the cookie spec's
 * `localhost` exception isn't implemented consistently across engines.
 * Without this, `gs_auth` would silently never get set during
 * `next dev` on `http://localhost:3000`, and `proxy.ts`'s cookie check
 * would bounce every protected route to `/sign-in` in a loop. Production
 * always serves over HTTPS, so `Secure` still applies there.
 */
const setCookie = (on: boolean) => {
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = on ? `gs_auth=1; path=/; SameSite=Lax${secure}` : 'gs_auth=; path=/; Max-Age=0';
};

type PartialSession = Pick<Session, 'status' | 'uid' | 'email' | 'claims' | 'operator' | 'user'>;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<PartialSession>({ status: 'loading' });
  // Bumped by `retry()`; in the effect's dependency list, so incrementing it tears the whole
  // auth+document subscription down and rebuilds it from scratch — a real retry, not a cosmetic
  // state reset that leaves the failed listeners in place.
  const [attempt, setAttempt] = useState(0);

  /**
   * Reads custom claims for a KNOWN, non-null Firebase user — the caller
   * (the `onAuthStateChanged` handler below, or `refreshClaims`) always
   * has one in hand. Deviation from the brief's sketch, disclosed in
   * task-2-report.md: the brief's version re-derived the user via
   * `firebase().auth.currentUser` instead of taking it as a parameter.
   * That's a real bug against the brief's OWN given test — the test's
   * `firebase/client` mock returns a bare `{ auth: {}, db: {} }` with no
   * `currentUser`, so `firebase().auth.currentUser` is always
   * `undefined` and `getIdTokenResult` would never be called. Taking the
   * user explicitly is also just more correct: it uses the exact user
   * object the auth-state transition just delivered instead of a
   * separate (and here, in the mock, disconnected) lookup.
   */
  const readClaims = useCallback(async (user: FirebaseUser, force = false): Promise<SessionClaims> => {
    const r = await getIdTokenResult(user, force);
    const c = r.claims as Record<string, unknown>;
    return {
      operatorId: typeof c.operatorId === 'string' ? c.operatorId : undefined,
      roles: (c.roles as Role[] | undefined) ?? [],
      venueIds: (c.venueIds as string[] | undefined) ?? [],
      claimsVersion: Number(c.claimsVersion ?? 0),
      assumed: c.assumed === true,
    };
  }, []);

  /**
   * Generation counter guarding the sign-out-mid-refresh resurrection
   * race (controller carry, task-2-brief.md — "carry the mobile 2a
   * session lessons"). Every `onAuthStateChanged` invocation bumps this
   * and captures its own value; every `setS`/`setCookie` call made from
   * that invocation's continuations (after an `await`, or from a later
   * `onSnapshot` callback it registered) first checks its captured
   * generation against the live one. If a newer auth event has already
   * landed — most importantly, a sign-out that fired while an older
   * sign-in's claims fetch was still in flight — the stale continuation
   * is a no-op. Without this, a slow `getIdTokenResult`/`onSnapshot`
   * response for a user who has already signed out could land after
   * `status` was set back to `signed_out` and flip it back to
   * `signed_in` (and re-set `gs_auth`) after the fact.
   */
  const epochRef = useRef(0);

  useEffect(() => {
    let unsubs: (() => void)[] = [];
    const stop = () => {
      unsubs.forEach((u) => u());
      unsubs = [];
    };

    const off = onAuthStateChanged(firebase().auth, async (u) => {
      const myEpoch = ++epochRef.current;
      stop();

      if (!u) {
        setCookie(false);
        setS({ status: 'signed_out' });
        return;
      }

      let claims: SessionClaims;
      try {
        claims = await readClaims(u);
      } catch {
        if (myEpoch !== epochRef.current) return;
        setCookie(false);
        setS({ status: 'signed_out' });
        return;
      }
      if (myEpoch !== epochRef.current) return;

      setCookie(true);
      setS({ status: claims.operatorId ? 'loading' : 'signed_in', uid: u.uid, email: u.email ?? undefined, claims });

      if (claims.operatorId) {
        const { db } = firebase();
        const operatorId = claims.operatorId;

        // Carry #43: BOTH listeners now carry an error callback. Without them a failed read left
        // `status` at `loading` forever (the user document never fires, so it never flips to
        // `signed_in`) or left `operator` permanently `undefined` while `status` said
        // `signed_in` — an infinite spinner either way, with no error surfaced and no way out.
        unsubs.push(
          onSnapshot(
            doc(db, `operators/${operatorId}`),
            (snap) => {
              if (myEpoch !== epochRef.current) return;
              setS((p) => ({ ...p, operator: snap.data() as Operator }));
            },
            () => {
              if (myEpoch !== epochRef.current) return;
              setS((p) => ({ ...p, status: 'error' }));
            }
          )
        );

        unsubs.push(
          onSnapshot(doc(db, `operators/${operatorId}/users/${u.uid}`), async (snap) => {
            if (myEpoch !== epochRef.current) return;
            const userDoc = snap.exists() ? (snap.data() as User & { claimsVersion?: number }) : undefined;

            if (userDoc?.claimsVersion && userDoc.claimsVersion > claims.claimsVersion) {
              let fresh: SessionClaims | undefined;
              try {
                fresh = await readClaims(u, true);
              } catch {
                fresh = undefined;
              }
              if (myEpoch !== epochRef.current) return;
              setS((p) => ({ ...p, claims: fresh ?? p.claims }));
            }

            if (myEpoch !== epochRef.current) return;
            // Must NOT clobber an error the OPERATOR listener already recorded. Both listeners are
            // registered together, and the operator one is registered first — so an operator
            // failure followed by a user-doc success would otherwise overwrite `error` with
            // `signed_in`, putting the session back in exactly the state carry #43 describes:
            // signed in, `operator` permanently undefined, every shell spinning on "Loading…".
            // `retry()` resets `status` to `loading`, so this guard never blocks a recovery.
            setS((p) => ({ ...p, user: userDoc, status: p.status === 'error' ? 'error' : 'signed_in' }));
          },
          () => {
            if (myEpoch !== epochRef.current) return;
            setS((p) => ({ ...p, status: 'error' }));
          })
        );
      }
    });

    return () => {
      off();
      stop();
      // `epochRef` is a plain generation counter, not a DOM-node ref;
      // bumping it here (not a stale-node concern the lint rule below is
      // meant to catch) is what invalidates any still-in-flight
      // continuation from this effect run.
      epochRef.current++; // eslint-disable-line react-hooks/exhaustive-deps
    };
  }, [readClaims, attempt]);

  const api = useMemo<Session>(
    () => ({
      ...s,
      isPlatformAdmin: s.claims?.roles.includes('platform_admin') ?? false,
      assumedOperatorId: s.claims?.assumed ? s.claims.operatorId : undefined,
      signOut: async () => {
        await fbSignOut(firebase().auth);
      },
      assumeOperator: async (operatorId: string) => {
        const { customToken } = await callable('identityAssumeOperator')({ operatorId });
        await signInWithCustomToken(firebase().auth, customToken);
      },
      leaveAssumed: async () => {
        await fbSignOut(firebase().auth);
        // Deliberate hard navigation, not `useRouter()` (unavailable here —
        // this is a plain async method, not a component) and not a soft
        // client-side redirect: leaving an assumed-operator session should
        // discard every in-memory, operator-scoped subscription and cache
        // (Firestore listeners, React Query cache) rather than risk any of
        // it surviving a client-side transition back to `/sign-in`.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/sign-in';
      },
      retry: () => {
        setS({ status: 'loading' });
        setAttempt((a) => a + 1);
      },
      refreshClaims: async () => {
        const u = firebase().auth.currentUser;
        if (!u) return;
        const c = await readClaims(u, true);
        setS((p) => ({ ...p, claims: c }));
      },
    }),
    [s, readClaims]
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}
