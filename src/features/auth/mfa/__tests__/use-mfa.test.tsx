import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// `vi.mock` factories are hoisted above the top of the file — referencing
// plain `const`s declared below them would hit the TDZ. `vi.hoisted`
// hoists this declaration alongside them instead (Vitest's documented
// pattern for exactly this case).
const { getSession, enroll, generateSecret, assertionForEnrollment, assertionForSignIn, resolveSignIn, getMultiFactorResolver } =
  vi.hoisted(() => ({
    getSession: vi.fn(async () => ({ id: 'session-1' })),
    enroll: vi.fn(async () => undefined),
    generateSecret: vi.fn(),
    assertionForEnrollment: vi.fn(() => ({ factorId: 'totp' })),
    assertionForSignIn: vi.fn(() => ({ factorId: 'totp' })),
    resolveSignIn: vi.fn(async () => ({ user: { uid: 'u1' } })),
    getMultiFactorResolver: vi.fn(),
  }));

vi.mock('firebase/auth', () => ({
  multiFactor: () => ({ getSession, enroll, enrolledFactors: [] }),
  getMultiFactorResolver,
  TotpMultiFactorGenerator: {
    generateSecret,
    assertionForEnrollment,
    assertionForSignIn,
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: { name: 'fake-auth' } }) }));

import { useMfaEnrollment, useMfaChallenge } from '../use-mfa';

const fakeUser = { uid: 'u1', email: 'owner@goldstar.example.com' } as never;

describe('useMfaEnrollment', () => {
  beforeEach(() => {
    getSession.mockClear();
    enroll.mockClear();
    generateSecret.mockReset();
    assertionForEnrollment.mockClear();
  });

  it('happy path: start() generates a secret and exposes a QR URL, verify() enrolls', async () => {
    const secret = { secretKey: 'ABC123', generateQrCodeUrl: vi.fn(() => 'otpauth://totp/Goldstar%20Valet') };
    generateSecret.mockResolvedValue(secret);

    const { result } = renderHook(() => useMfaEnrollment(fakeUser));
    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.start();
    });

    expect(getSession).toHaveBeenCalled();
    expect(generateSecret).toHaveBeenCalledWith({ id: 'session-1' });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.secret).toBe(secret);
    expect(result.current.qrCodeUrl).toBe('otpauth://totp/Goldstar%20Valet');

    await act(async () => {
      await result.current.verify('123456');
    });

    expect(assertionForEnrollment).toHaveBeenCalledWith(secret, '123456');
    expect(enroll).toHaveBeenCalledWith({ factorId: 'totp' }, 'Authenticator app');
    await waitFor(() => expect(result.current.status).toBe('enrolled'));
  });

  it('sets status to unsupported on auth/operation-not-allowed (MFA not enabled for the project)', async () => {
    getSession.mockRejectedValueOnce({ code: 'auth/operation-not-allowed' });
    const { result } = renderHook(() => useMfaEnrollment(fakeUser));

    await act(async () => {
      await result.current.start();
    });

    await waitFor(() => expect(result.current.status).toBe('unsupported'));
    expect(result.current.error).toBeNull();
  });

  it('sets a sanitized error and returns to ready on an incorrect code', async () => {
    const secret = { secretKey: 'ABC123', generateQrCodeUrl: vi.fn(() => 'otpauth://totp/x') };
    generateSecret.mockResolvedValue(secret);
    enroll.mockRejectedValueOnce({ code: 'auth/invalid-verification-code', message: 'raw detail' });

    const { result } = renderHook(() => useMfaEnrollment(fakeUser));
    await act(async () => {
      await result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.verify('000000');
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.error).toBe('That code is incorrect. Try again.');
  });

  it('does nothing when there is no user', async () => {
    const { result } = renderHook(() => useMfaEnrollment(undefined));
    await act(async () => {
      await result.current.start();
    });
    expect(getSession).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

describe('useMfaChallenge', () => {
  beforeEach(() => {
    getMultiFactorResolver.mockReset();
    assertionForSignIn.mockClear();
    resolveSignIn.mockClear();
  });

  it('resolves the challenge and returns a UserCredential on a correct code', async () => {
    const resolver = { hints: [{ uid: 'factor-1' }], resolveSignIn };
    getMultiFactorResolver.mockReturnValue(resolver);
    const mfaError = { code: 'auth/multi-factor-auth-required' } as never;

    const { result } = renderHook(() => useMfaChallenge());
    act(() => {
      result.current.beginChallenge(mfaError);
    });
    expect(result.current.resolver).toBe(resolver);

    let cred: unknown;
    await act(async () => {
      cred = await result.current.submitCode('123456');
    });

    expect(assertionForSignIn).toHaveBeenCalledWith('factor-1', '123456');
    expect(resolveSignIn).toHaveBeenCalledWith({ factorId: 'totp' });
    expect(cred).toEqual({ user: { uid: 'u1' } });
    expect(result.current.status).toBe('idle');
  });

  it('shows a sanitized error on an incorrect code', async () => {
    const resolver = { hints: [{ uid: 'factor-1' }], resolveSignIn: vi.fn(async () => {
      throw { code: 'auth/invalid-verification-code', message: 'raw detail' };
    }) };
    getMultiFactorResolver.mockReturnValue(resolver);

    const { result } = renderHook(() => useMfaChallenge());
    act(() => {
      result.current.beginChallenge({ code: 'auth/multi-factor-auth-required' } as never);
    });

    let cred: unknown;
    await act(async () => {
      cred = await result.current.submitCode('000000');
    });

    expect(cred).toBeUndefined();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('That code is incorrect. Try again.');
  });

  it('clear() resets the resolver', () => {
    getMultiFactorResolver.mockReturnValue({ hints: [], resolveSignIn });
    const { result } = renderHook(() => useMfaChallenge());
    act(() => {
      result.current.beginChallenge({ code: 'auth/multi-factor-auth-required' } as never);
    });
    expect(result.current.resolver).not.toBeNull();
    act(() => {
      result.current.clear();
    });
    expect(result.current.resolver).toBeNull();
  });
});
