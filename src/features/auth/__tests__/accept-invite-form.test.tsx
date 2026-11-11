import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlatformError } from '@goldstar/platform';

const signInWithEmailAndPassword = vi.fn();
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPassword(...args),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: {} }) }));

const callableFn = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => callableFn }));

const replace = vi.fn();
let searchParamsValue: Record<string, string> = { token: 'invite-token-123' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (key: string) => searchParamsValue[key] ?? null }),
}));

let mockSessionStatus: 'loading' | 'signed_out' | 'signed_in' = 'signed_out';
let mockSessionEmail: string | undefined = undefined;
const refreshClaims = vi.fn(async () => undefined);
vi.mock('../use-session', () => ({
  useSession: () => ({ status: mockSessionStatus, email: mockSessionEmail, refreshClaims }),
}));

import { AcceptInviteForm } from '../accept-invite-form';

describe('AcceptInviteForm', () => {
  beforeEach(() => {
    signInWithEmailAndPassword.mockReset();
    callableFn.mockReset();
    replace.mockReset();
    refreshClaims.mockReset();
    refreshClaims.mockResolvedValue(undefined);
    searchParamsValue = { token: 'invite-token-123' };
    mockSessionStatus = 'signed_out';
    mockSessionEmail = undefined;
  });

  it('shows an error and no form when the token is missing from the URL', () => {
    searchParamsValue = {};
    render(<AcceptInviteForm />);
    expect(screen.getByRole('alert')).toHaveTextContent('missing its token');
    expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
  });

  it('happy path: token from URL + a chosen password calls identityAcceptInvitation, then signs in, then redirects once signed_in', async () => {
    callableFn.mockResolvedValue({ uid: 'u1', operatorId: 'goldstar', email: 'new.staff@goldstar.example.com' });
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    const { rerender } = render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Password/), 'supersecret1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'supersecret1');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() =>
      expect(callableFn).toHaveBeenCalledWith({
        token: 'invite-token-123',
        password: 'supersecret1',
        displayName: undefined,
      })
    );
    await waitFor(() =>
      expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'new.staff@goldstar.example.com', 'supersecret1')
    );
    expect(replace).not.toHaveBeenCalled();

    mockSessionStatus = 'signed_in';
    await act(async () => {
      rerender(<AcceptInviteForm />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
  });

  it('passes a trimmed displayName through when provided', async () => {
    callableFn.mockResolvedValue({ uid: 'u1', operatorId: 'goldstar', email: 'a@x.example.com' });
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Your name/), '  Jordan Lee  ');
    await user.type(screen.getByLabelText(/^Password/), 'supersecret1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'supersecret1');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() =>
      expect(callableFn).toHaveBeenCalledWith({
        token: 'invite-token-123',
        password: 'supersecret1',
        displayName: 'Jordan Lee',
      })
    );
  });

  it('rejects a 9-character password without calling the callable (contract requires min 10)', async () => {
    const user = userEvent.setup();
    render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Password/), '123456789');
    await user.type(screen.getByLabelText(/^Confirm password/), '123456789');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 10 characters');
    expect(callableFn).not.toHaveBeenCalled();
  });

  it('accepts a 10-character password and passes it through to the callable', async () => {
    callableFn.mockResolvedValue({ uid: 'u1', operatorId: 'goldstar', email: 'new.staff@goldstar.example.com' });
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Password/), '1234567890');
    await user.type(screen.getByLabelText(/^Confirm password/), '1234567890');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    await waitFor(() =>
      expect(callableFn).toHaveBeenCalledWith({
        token: 'invite-token-123',
        password: '1234567890',
        displayName: undefined,
      })
    );
  });

  it('rejects mismatched passwords without calling the callable', async () => {
    const user = userEvent.setup();
    render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Password/), 'supersecret1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'different1');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(callableFn).not.toHaveBeenCalled();
  });

  it('shows sanitized copy when the callable rejects with a PlatformError, never the raw message', async () => {
    callableFn.mockRejectedValue(new PlatformError('guest_token_expired', 'internal detail: token row TTL exceeded'));
    const user = userEvent.setup();
    render(<AcceptInviteForm />);

    await user.type(screen.getByLabelText(/^Password/), 'supersecret1');
    await user.type(screen.getByLabelText(/^Confirm password/), 'supersecret1');
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This link has expired.');
    expect(alert.textContent).not.toContain('internal detail');
    expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
  });

  describe('already signed in (Fix round 1 Minor)', () => {
    beforeEach(() => {
      mockSessionStatus = 'signed_in';
      mockSessionEmail = 'admin@goldstar.example.com';
    });

    it('shows an "already signed in" prompt instead of the password form', () => {
      render(<AcceptInviteForm />);
      expect(screen.getByText(/already signed in as/i)).toHaveTextContent('admin@goldstar.example.com');
      expect(screen.queryByLabelText(/^Password/)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^Confirm password/)).not.toBeInTheDocument();
    });

    it('accepting calls the callable WITHOUT a password, refreshes claims, and redirects — never calls signInWithEmailAndPassword', async () => {
      callableFn.mockResolvedValue({ uid: 'u1', operatorId: 'goldstar', email: 'admin@goldstar.example.com' });
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

      await waitFor(() => expect(callableFn).toHaveBeenCalledWith({ token: 'invite-token-123' }));
      await waitFor(() => expect(refreshClaims).toHaveBeenCalled());
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/home'));
      expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
    });

    it('shows sanitized copy when the callable rejects, and does not redirect', async () => {
      callableFn.mockRejectedValue(new PlatformError('guest_token_expired', 'internal detail'));
      const user = userEvent.setup();
      render(<AcceptInviteForm />);

      await user.click(screen.getByRole('button', { name: 'Accept invitation' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('This link has expired.');
      expect(replace).not.toHaveBeenCalled();
      expect(refreshClaims).not.toHaveBeenCalled();
    });
  });
});
