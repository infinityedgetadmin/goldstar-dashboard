import { render, renderHook, act, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Plan 8 carry #43: a required session document failing to load used to leave the user on an
 * infinite "Loading…" — neither `onSnapshot` had an error callback, so the failure was
 * indistinguishable from a slow load and nothing ever reported it.
 *
 * The trap runs BOTH ways, so both are pinned here: a real error must surface, AND a genuinely
 * slow load must keep reading as `loading` rather than flashing an error at a user whose
 * connection is merely poor.
 */

const authState: { cb?: (u: unknown) => void } = {};
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => {
    authState.cb = cb;
    return () => {};
  },
  getIdTokenResult: vi.fn(async () => ({
    claims: { operatorId: 'goldstar', roles: ['admin'], venueIds: [], claimsVersion: 1 },
  })),
  signOut: vi.fn(),
  signInWithCustomToken: vi.fn(),
}));

/**
 * Per-path control over each subscription: `resolve` fires the success callback, `fail` fires the
 * error callback, and the default does NEITHER — which is exactly what a slow (or offline)
 * Firestore listener looks like, since Firestore retries transient conditions internally and does
 * not invoke `onError` for them.
 */
type Behavior = 'resolve' | 'fail' | 'hang';
const behavior: { operator: Behavior; user: Behavior } = { operator: 'resolve', user: 'resolve' };
let subscribeCount = 0;

vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_d: unknown, p: string) => ({ path: p }),
  onSnapshot: (ref: { path: string }, next: (s: unknown) => void, onError?: (e: Error) => void) => {
    subscribeCount += 1;
    const isUserDoc = ref.path.startsWith('operators/goldstar/users');
    const mode = isUserDoc ? behavior.user : behavior.operator;
    if (mode === 'resolve') {
      next({
        exists: () => true,
        data: () =>
          isUserDoc
            ? { uid: 'u1', roles: ['admin'], venueIds: [], claimsVersion: 1 }
            : { id: 'goldstar', branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' } },
      });
    } else if (mode === 'fail') {
      onError?.(Object.assign(new Error('permission-denied'), { code: 'permission-denied' }));
    }
    return () => {};
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: {}, db: {} }) }));

import { SessionProvider, SessionContext } from '../session-provider';
import { useSession } from '../use-session';
import { SessionErrorScreen } from '../session-error';

async function signIn() {
  await act(async () => {
    authState.cb?.({ uid: 'u1', email: 'host@grill.example.com' });
  });
}

beforeEach(() => {
  behavior.operator = 'resolve';
  behavior.user = 'resolve';
  subscribeCount = 0;
  document.cookie = 'gs_auth=; path=/; Max-Age=0';
});

describe('session load failure (carry #43)', () => {
  it('surfaces status "error" when the OPERATOR document fails to load', async () => {
    behavior.operator = 'fail';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('surfaces status "error" when the caller\'s OWN user document fails to load', async () => {
    behavior.user = 'fail';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('the operator failure is the one that used to hang: user doc resolves, so status would otherwise read signed_in with no operator', async () => {
    behavior.operator = 'fail';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('error'));
    // Proves the diagnosis rather than just the symptom: the user doc DID arrive.
    expect(result.current.user).toBeDefined();
    expect(result.current.operator).toBeUndefined();
  });

  it('THE OTHER TRAP: a slow load stays "loading" and never flashes an error', async () => {
    // Neither callback ever fires — a listener that has not answered yet. Firestore retries
    // transient/offline conditions internally and does NOT call onError for them, so this is what
    // "slow" genuinely looks like at this boundary.
    behavior.operator = 'hang';
    behavior.user = 'hang';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();

    expect(result.current.status).toBe('loading');
    // Still loading after time passes — nothing times out into an error.
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.status).toBe('loading');
    expect(result.current.status).not.toBe('error');
  });

  it('a slow OPERATOR doc alone does not error — the user doc still completes sign-in', async () => {
    behavior.operator = 'hang';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('signed_in'));
    expect(result.current.status).not.toBe('error');
  });

  it('retry() tears down and re-establishes the subscriptions, recovering when the read succeeds', async () => {
    behavior.operator = 'fail';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('error'));
    const beforeRetry = subscribeCount;

    // The underlying problem clears, then the user retries.
    behavior.operator = 'resolve';
    await act(async () => {
      result.current.retry();
      authState.cb?.({ uid: 'u1', email: 'host@grill.example.com' });
    });

    await waitFor(() => expect(result.current.status).toBe('signed_in'));
    expect(result.current.operator?.branding.displayName).toBe('Goldstar');
    // A real re-subscribe, not just a state reset that leaves the failed listeners in place.
    expect(subscribeCount).toBeGreaterThan(beforeRetry);
  });

  it('retry() returns to loading immediately rather than sitting on the error screen', async () => {
    behavior.operator = 'fail';
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    await signIn();
    await waitFor(() => expect(result.current.status).toBe('error'));

    behavior.operator = 'hang';
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
  });
});

describe('SessionErrorScreen', () => {
  const session = {
    status: 'error' as const,
    isPlatformAdmin: false,
    signOut: vi.fn(),
    retry: vi.fn(),
    assumeOperator: vi.fn(),
    leaveAssumed: vi.fn(),
    refreshClaims: vi.fn(),
  };

  function renderScreen() {
    return render(
      <SessionContextHarness>
        <SessionErrorScreen />
      </SessionContextHarness>
    );
  }

  // Feeds the real context rather than mocking `useSession`, so the screen is tested against the
  // shape the provider actually publishes.
  function SessionContextHarness({ children }: { children: React.ReactNode }) {
    return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
  }

  beforeEach(() => {
    session.signOut.mockReset();
    session.retry.mockReset();
  });

  it('says what happened without guessing at a cause', () => {
    renderScreen();
    expect(screen.getByRole('heading', { name: /couldn't load your account/i })).toBeInTheDocument();
    expect(screen.getByText(/usually temporary/i)).toBeInTheDocument();
    // No invented diagnosis: the client cannot tell permissions from an outage from a deleted
    // operator, and naming one would send the user to the wrong person.
    expect(screen.queryByText(/permission/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/network/i)).not.toBeInTheDocument();
  });

  it('offers a working way out: Try again calls retry', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(session.retry).toHaveBeenCalledTimes(1);
  });

  it('offers a second way out: Sign out calls signOut', () => {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(session.signOut).toHaveBeenCalledTimes(1);
  });
});
