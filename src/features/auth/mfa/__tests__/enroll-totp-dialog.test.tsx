import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above the top of the file — `vi.hoisted`
// hoists this declaration alongside them to avoid a TDZ reference error.
const { getSession, enroll, generateSecret, assertionForEnrollment } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ id: 'session-1' })),
  enroll: vi.fn(async () => undefined),
  generateSecret: vi.fn(),
  assertionForEnrollment: vi.fn(() => ({ factorId: 'totp' })),
}));

vi.mock('firebase/auth', () => ({
  multiFactor: () => ({ getSession, enroll, enrolledFactors: [] }),
  TotpMultiFactorGenerator: {
    generateSecret,
    assertionForEnrollment,
  },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(async () => 'data:image/png;base64,fake'),
}));

import { EnrollTotpDialog } from '../enroll-totp-dialog';

const fakeUser = { uid: 'u1', email: 'owner@goldstar.example.com' } as never;

describe('EnrollTotpDialog', () => {
  beforeEach(() => {
    getSession.mockClear();
    enroll.mockClear();
    generateSecret.mockReset();
    generateSecret.mockResolvedValue({
      secretKey: 'ABC123DEF456',
      generateQrCodeUrl: vi.fn(() => 'otpauth://totp/Goldstar%20Valet:owner@goldstar.example.com'),
    });
  });

  it('generates a secret and renders the QR code + manual key when opened', async () => {
    render(<EnrollTotpDialog user={fakeUser} open onOpenChange={() => {}} />);

    await waitFor(() => expect(generateSecret).toHaveBeenCalled());
    await screen.findByAltText('Scan this QR code with your authenticator app');
    expect(screen.getByText(/ABC123DEF456/)).toBeInTheDocument();
  });

  it('happy path: entering the correct code enrolls and shows success, calling onEnrolled', async () => {
    const onEnrolled = vi.fn();
    const user = userEvent.setup();
    render(<EnrollTotpDialog user={fakeUser} open onOpenChange={() => {}} onEnrolled={onEnrolled} />);

    const codeInput = await screen.findByLabelText('6-digit code', { exact: false });
    await user.type(codeInput, '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => expect(enroll).toHaveBeenCalledWith({ factorId: 'totp' }, 'Authenticator app'));
    expect(await screen.findByRole('status')).toHaveTextContent('Two-factor authentication is enabled');
    expect(onEnrolled).toHaveBeenCalled();
  });

  it('shows an honest "not enabled" message on auth/operation-not-allowed', async () => {
    getSession.mockRejectedValueOnce({ code: 'auth/operation-not-allowed' });
    render(<EnrollTotpDialog user={fakeUser} open onOpenChange={() => {}} />);

    expect(await screen.findByText(/isn't enabled for this project yet/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('6-digit code', { exact: false })).not.toBeInTheDocument();
  });

  it('shows a sanitized error and stays on the code screen for an incorrect code', async () => {
    enroll.mockRejectedValueOnce({ code: 'auth/invalid-verification-code', message: 'raw detail' });
    const user = userEvent.setup();
    render(<EnrollTotpDialog user={fakeUser} open onOpenChange={() => {}} />);

    const codeInput = await screen.findByLabelText('6-digit code', { exact: false });
    await user.type(codeInput, '000000');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    expect(await screen.findByText('That code is incorrect. Try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code', { exact: false })).toBeInTheDocument();
  });

  it('resets when closed and reopened', async () => {
    const { rerender } = render(<EnrollTotpDialog user={fakeUser} open={false} onOpenChange={() => {}} />);
    rerender(<EnrollTotpDialog user={fakeUser} open onOpenChange={() => {}} />);
    await waitFor(() => expect(generateSecret).toHaveBeenCalledTimes(1));
  });
});
