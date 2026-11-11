import { render, screen } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { describe, expect, it, vi } from 'vitest';

let enrolledFactors: unknown[] = [];
vi.mock('firebase/auth', () => ({
  multiFactor: () => ({ enrolledFactors }),
}));

let mockCurrentUser: unknown = { uid: 'u1', email: 'owner@goldstar.example.com' };
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: { currentUser: mockCurrentUser } }) }));

let mockSession: {
  operator?: { security?: { requireMfaForAdmins?: boolean } };
  claims?: { roles: string[] };
} = {};
vi.mock('../../use-session', () => ({
  useSession: () => mockSession,
}));

// EnrollTotpDialog pulls in the full `useMfaEnrollment` + `qrcode` stack —
// stubbed here so this test stays scoped to the gate's OWN decision (does
// it render the enrollment UI or `children`?), not the dialog's internals
// (covered by enroll-totp-dialog.test.tsx and use-mfa.test.tsx).
vi.mock('../enroll-totp-dialog', () => ({
  EnrollTotpDialog: () => <div data-testid="enroll-dialog">enroll dialog</div>,
}));

import { MfaEnforcementGate } from '../mfa-enforcement-gate';

describe('MfaEnforcementGate', () => {
  it('renders children when the operator does not require MFA', () => {
    mockSession = { operator: { security: { requireMfaForAdmins: false } }, claims: { roles: ['owner'] } };
    enrolledFactors = [];
    render(
      <MfaEnforcementGate>
        <div>dashboard content</div>
      </MfaEnforcementGate>
    );
    expect(screen.getByText('dashboard content')).toBeInTheDocument();
    expect(screen.queryByTestId('enroll-dialog')).not.toBeInTheDocument();
  });

  it('renders children when MFA is required but the role is not owner/admin (e.g. lead)', () => {
    mockSession = { operator: { security: { requireMfaForAdmins: true } }, claims: { roles: ['lead'] } };
    enrolledFactors = [];
    render(
      <MfaEnforcementGate>
        <div>dashboard content</div>
      </MfaEnforcementGate>
    );
    expect(screen.getByText('dashboard content')).toBeInTheDocument();
  });

  it('renders children when MFA is required and the user already has an enrolled factor', () => {
    mockSession = { operator: { security: { requireMfaForAdmins: true } }, claims: { roles: ['owner'] } };
    enrolledFactors = [{ uid: 'factor-1' }];
    render(
      <MfaEnforcementGate>
        <div>dashboard content</div>
      </MfaEnforcementGate>
    );
    expect(screen.getByText('dashboard content')).toBeInTheDocument();
  });

  it('blocks children and renders the enrollment dialog when MFA is required, the role is owner/admin, and no factor is enrolled', () => {
    mockSession = { operator: { security: { requireMfaForAdmins: true } }, claims: { roles: ['admin'] } };
    enrolledFactors = [];
    render(
      <MfaEnforcementGate>
        <div>dashboard content</div>
      </MfaEnforcementGate>
    );
    expect(screen.getByTestId('enroll-dialog')).toBeInTheDocument();
    expect(screen.queryByText('dashboard content')).not.toBeInTheDocument();
  });

  it('renders children when there is no current Firebase user yet (still resolving)', () => {
    mockCurrentUser = null;
    mockSession = { operator: { security: { requireMfaForAdmins: true } }, claims: { roles: ['owner'] } };
    enrolledFactors = [];
    render(
      <MfaEnforcementGate>
        <div>dashboard content</div>
      </MfaEnforcementGate>
    );
    expect(screen.getByText('dashboard content')).toBeInTheDocument();
    mockCurrentUser = { uid: 'u1', email: 'owner@goldstar.example.com' };
  });

  it('regression (Fix round 1 Major): blocks children on the very first synchronous commit — no transient frame of protected content before enrollment is confirmed', () => {
    mockSession = { operator: { security: { requireMfaForAdmins: true } }, claims: { roles: ['admin'] } };
    enrolledFactors = [];

    // Deliberately bypasses `@testing-library/react`'s `render()`: it
    // wraps mounting in `act()`, which flushes passive effects (`useEffect`)
    // synchronously before returning — that's exactly why the pre-fix bug
    // (enrolledCount computed in a `useEffect` instead of a lazy `useState`
    // initializer) was invisible to every other test in this file, even
    // the "blocks children" case above. `flushSync` forces React to
    // synchronously commit the render (so a lazy-initializer-computed
    // value IS visible here), but it does NOT flush passive effects —
    // those stay scheduled for a later macrotask, same as in a real
    // browser's first paint. Reading the DOM immediately after
    // `flushSync` returns, with nothing awaited in between, checks
    // exactly what a real browser would paint on the very first frame.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      flushSync(() => {
        root.render(
          <MfaEnforcementGate>
            <div>dashboard content</div>
          </MfaEnforcementGate>
        );
      });

      expect(container.textContent).not.toContain('dashboard content');
      expect(container.querySelector('[data-testid="enroll-dialog"]')).not.toBeNull();
    } finally {
      root.unmount();
      document.body.removeChild(container);
    }
  });
});
