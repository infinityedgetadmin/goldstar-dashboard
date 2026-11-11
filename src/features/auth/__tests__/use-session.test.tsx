import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
vi.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
  doc: (_d: unknown, p: string) => ({ path: p }),
  onSnapshot: (ref: { path: string }, cb: (s: unknown) => void) => {
    cb({
      exists: () => true,
      data: () =>
        ref.path.startsWith('operators/goldstar/users')
          ? { uid: 'u1', roles: ['admin'], venueIds: [], claimsVersion: 1 }
          : { id: 'goldstar', branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' } },
    });
    return () => {};
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: {}, db: {} }) }));
import { SessionProvider } from '../session-provider';
import { useSession } from '../use-session';
describe('useSession', () => {
  it('resolves claims, operator, user and sets the gs_auth cookie', async () => {
    const { result } = renderHook(() => useSession(), { wrapper: SessionProvider });
    // Mock plumbing adaptation (task-2-report.md): `act()` wraps an async
    // callback here (the onAuthStateChanged listener triggers an async
    // claims fetch + Firestore subscriptions), and React's `act()`
    // explicitly documents that an un-awaited async callback can
    // "interleav[e] multiple act calls and mix[] their scopes" — verified
    // empirically against this repo's installed React 19 / RTL 16 /
    // Vitest 3: without `await`, the state updates never commit within
    // the observation window at all (confirmed by instrumenting the
    // provider's render count), not merely a timing flake. `await` fixes
    // that; no assertion below is changed.
    await act(async () => {
      authState.cb?.({ uid: 'u1', email: 'a@x.example.com' });
    });
    await waitFor(() => expect(result.current.status).toBe('signed_in'));
    expect(result.current.operator?.branding.displayName).toBe('Goldstar');
    expect(document.cookie).toContain('gs_auth=1');
    await act(async () => {
      authState.cb?.(null);
    });
    await waitFor(() => expect(result.current.status).toBe('signed_out'));
    expect(document.cookie).not.toContain('gs_auth=1');
  });
});
