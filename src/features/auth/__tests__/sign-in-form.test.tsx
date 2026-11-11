import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const signInWithEmailAndPassword = vi.fn();
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInWithEmailAndPassword(...args),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: {} }) }));

const replace = vi.fn();
let searchParamsValue: Record<string, string> = {};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => ({ get: (key: string) => searchParamsValue[key] ?? null }),
}));

let mockSessionStatus: 'loading' | 'signed_out' | 'signed_in' | 'error' = 'signed_out';
vi.mock('../use-session', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

const mfaSuccessSpy = vi.fn();
vi.mock('../mfa/mfa-challenge', () => ({
  MfaChallenge: ({ onSuccess }: { onSuccess: () => void }) => (
    <button type="button" onClick={() => { mfaSuccessSpy(); onSuccess(); }}>
      complete mfa
    </button>
  ),
}));

import { SignInForm } from '../sign-in-form';

describe('SignInForm', () => {
  beforeEach(() => {
    signInWithEmailAndPassword.mockReset();
    replace.mockReset();
    mfaSuccessSpy.mockReset();
    searchParamsValue = {};
    mockSessionStatus = 'signed_out';
  });

  it('renders email and password fields and a submit button', () => {
    render(<SignInForm />);
    expect(screen.getByLabelText('Email', { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText('Password', { exact: false })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });

  it('signs in and redirects to "/home" once the session resolves to signed_in', async () => {
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    const { rerender } = render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalledWith({}, 'owner@goldstar.example.com', 'hunter2'));
    // The redirect must not fire until the session actually resolves —
    // `gs_auth` isn't set yet at this point (see sign-in-form.tsx's header comment).
    expect(replace).not.toHaveBeenCalled();

    mockSessionStatus = 'signed_in';
    await act(async () => {
      rerender(<SignInForm />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home')); // F6 (final-review.md): default redirect target moved from '/' to '/home'
  });

  it('a session that ends in error stops the spinner and says so, instead of spinning forever', async () => {
    // Regression: `awaitingSession` drives the submit button's spinner and used to have exactly one
    // exit — reaching `signed_in`. A failed operator/user-doc read leaves SessionProvider at
    // `error`, which looked to the user like a sign-in that never finishes and never explains why.
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    const { rerender } = render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalled());

    mockSessionStatus = 'error';
    await act(async () => {
      rerender(<SignInForm />);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/profile could not be loaded/i);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toBeDisabled();
  });

  it('redirects to the ?next= path when present', async () => {
    searchParamsValue = { next: '/tickets' };
    signInWithEmailAndPassword.mockResolvedValue({});
    const user = userEvent.setup();
    const { rerender } = render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(signInWithEmailAndPassword).toHaveBeenCalled());

    mockSessionStatus = 'signed_in';
    await act(async () => {
      rerender(<SignInForm />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/tickets'));
  });

  it('shows sanitized copy for a wrong-password error, never the raw message', async () => {
    signInWithEmailAndPassword.mockRejectedValue({
      code: 'auth/wrong-password',
      message: 'INTERNAL: password hash mismatch at auth-provider.ts:412',
    });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid email or password.');
    expect(alert.textContent).not.toContain('INTERNAL');
    expect(replace).not.toHaveBeenCalled();
  });

  it('falls back to generic copy for an unrecognized error code', async () => {
    signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/internal-error', message: 'raw internal detail' });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('switches to the MFA challenge on auth/multi-factor-auth-required, then redirects on success', async () => {
    signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/multi-factor-auth-required' });
    const user = userEvent.setup();
    const { rerender } = render(<SignInForm />);

    await user.type(screen.getByLabelText('Email', { exact: false }), 'owner@goldstar.example.com');
    await user.type(screen.getByLabelText('Password', { exact: false }), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const mfaButton = await screen.findByRole('button', { name: 'complete mfa' });
    expect(screen.queryByLabelText('Email', { exact: false })).not.toBeInTheDocument();

    await user.click(mfaButton);
    expect(mfaSuccessSpy).toHaveBeenCalled();

    mockSessionStatus = 'signed_in';
    await act(async () => {
      rerender(<SignInForm />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/home')); // F6 (final-review.md): default redirect target moved from '/' to '/home'
  });
});
