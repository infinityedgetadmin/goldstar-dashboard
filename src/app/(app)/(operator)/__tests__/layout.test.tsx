import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Role } from '@goldstar/platform';
import type { Session } from '@/features/auth/session-provider';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/home',
}));

// `SessionProvider` would open real Firebase auth listeners; the gate under test reads
// `useSession()`, which is mocked below, so a pass-through is enough.
vi.mock('@/features/auth/session-provider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// MFA enforcement and the shell chrome have their own suites; here they only need to not swallow
// the page content the gate lets through.
vi.mock('@/features/auth/mfa/mfa-enforcement-gate', () => ({
  MfaEnforcementGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import OperatorLayout from '../layout';

function session(roles: Role[], { withOperator = true }: { withOperator?: boolean } = {}): Partial<Session> {
  return {
    status: 'signed_in',
    uid: 'u1',
    isPlatformAdmin: roles.includes('platform_admin'),
    claims: withOperator
      ? { operatorId: 'op1', roles, venueIds: ['v1'], claimsVersion: 1 }
      : { roles, venueIds: ['v1'], claimsVersion: 1 },
  };
}

beforeEach(() => {
  replace.mockClear();
});

describe('OperatorLayout: access gate', () => {
  it('renders the operator shell for an owner', async () => {
    mockSession = session(['owner']);
    render(<OperatorLayout>operator page content</OperatorLayout>);
    expect(await screen.findByText('operator page content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the operator shell for a platform admin', async () => {
    mockSession = session(['platform_admin', 'admin']);
    render(<OperatorLayout>operator page content</OperatorLayout>);
    expect(await screen.findByText('operator page content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a venue partner to their portal instead of /no-access', async () => {
    // Sign-in and accept-invite both land on /home. A venue_user used to be bounced from there to
    // "You don't have access to this page" on every normal sign-in.
    mockSession = session(['venue_user']);
    render(<OperatorLayout>operator page content</OperatorLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/venue'));
    expect(replace).not.toHaveBeenCalledWith('/no-access');
    expect(screen.queryByText('operator page content')).not.toBeInTheDocument();
  });

  it('keeps a manager who is also a venue_user in the operator shell', async () => {
    mockSession = session(['admin', 'venue_user']);
    render(<OperatorLayout>operator page content</OperatorLayout>);
    expect(await screen.findByText('operator page content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends an attendant (no manager or venue role) to /no-access', async () => {
    mockSession = session(['attendant']);
    render(<OperatorLayout>operator page content</OperatorLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByText('operator page content')).not.toBeInTheDocument();
  });

  it('sends a venue_user with no operator claim to /no-access, not the portal', async () => {
    mockSession = session(['venue_user'], { withOperator: false });
    render(<OperatorLayout>operator page content</OperatorLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(replace).not.toHaveBeenCalledWith('/venue');
  });

  it('sends a signed-out visitor to /sign-in with a next param', async () => {
    mockSession = { status: 'signed_out', isPlatformAdmin: false };
    render(<OperatorLayout>operator page content</OperatorLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in?next=%2Fhome'));
  });

  it('shows only a skeleton while the session is still loading — no redirect yet', () => {
    mockSession = { status: 'loading', isPlatformAdmin: false };
    render(<OperatorLayout>operator page content</OperatorLayout>);
    expect(screen.queryByText('operator page content')).not.toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
