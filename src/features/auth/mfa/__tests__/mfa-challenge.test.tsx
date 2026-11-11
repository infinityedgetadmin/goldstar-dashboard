import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above the top of the file — `vi.hoisted`
// hoists this declaration alongside them to avoid a TDZ reference error.
const { getMultiFactorResolver, assertionForSignIn, resolveSignIn } = vi.hoisted(() => ({
  getMultiFactorResolver: vi.fn(),
  assertionForSignIn: vi.fn(() => ({ factorId: 'totp' })),
  resolveSignIn: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  getMultiFactorResolver,
  TotpMultiFactorGenerator: {
    assertionForSignIn,
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: {} }) }));

import { MfaChallenge } from '../mfa-challenge';

const mfaError = { code: 'auth/multi-factor-auth-required' } as never;

describe('MfaChallenge', () => {
  beforeEach(() => {
    getMultiFactorResolver.mockReset();
    assertionForSignIn.mockClear();
    resolveSignIn.mockReset();
  });

  it('begins the challenge on mount and, on a correct code, calls onSuccess with the credential', async () => {
    const resolver = { hints: [{ uid: 'factor-1' }], resolveSignIn };
    getMultiFactorResolver.mockReturnValue(resolver);
    resolveSignIn.mockResolvedValue({ user: { uid: 'u1' } });

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<MfaChallenge mfaError={mfaError} onSuccess={onSuccess} onCancel={vi.fn()} />);

    await waitFor(() => expect(getMultiFactorResolver).toHaveBeenCalledWith({}, mfaError));

    await user.type(screen.getByLabelText('6-digit code', { exact: false }), '654321');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ user: { uid: 'u1' } }));
    expect(assertionForSignIn).toHaveBeenCalledWith('factor-1', '654321');
  });

  it('shows a sanitized error on an incorrect code and does not call onSuccess', async () => {
    const resolver = { hints: [{ uid: 'factor-1' }], resolveSignIn };
    getMultiFactorResolver.mockReturnValue(resolver);
    resolveSignIn.mockRejectedValue({ code: 'auth/invalid-verification-code', message: 'raw detail' });

    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<MfaChallenge mfaError={mfaError} onSuccess={onSuccess} onCancel={vi.fn()} />);

    await waitFor(() => expect(getMultiFactorResolver).toHaveBeenCalled());
    await user.type(screen.getByLabelText('6-digit code', { exact: false }), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByText('That code is incorrect. Try again.')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onCancel when Back is pressed', async () => {
    getMultiFactorResolver.mockReturnValue({ hints: [{ uid: 'factor-1' }], resolveSignIn });
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<MfaChallenge mfaError={mfaError} onSuccess={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables Verify until a 6-digit code is entered', async () => {
    getMultiFactorResolver.mockReturnValue({ hints: [{ uid: 'factor-1' }], resolveSignIn });
    const user = userEvent.setup();
    render(<MfaChallenge mfaError={mfaError} onSuccess={vi.fn()} onCancel={vi.fn()} />);

    const verifyButton = screen.getByRole('button', { name: 'Verify' });
    expect(verifyButton).toBeDisabled();
    await user.type(screen.getByLabelText('6-digit code', { exact: false }), '12345');
    expect(verifyButton).toBeDisabled();
    await user.type(screen.getByLabelText('6-digit code', { exact: false }), '6');
    expect(verifyButton).not.toBeDisabled();
  });
});
