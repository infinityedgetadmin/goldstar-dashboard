import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV_KEYS = ['NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY', 'NEXT_PUBLIC_USE_EMULATORS'] as const;
const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  // '../env' throws at module load in some of the tests below; the ESM
  // module cache treats a throwing module as permanently failed, so each
  // test needs a fresh module registry to re-run the load-time check.
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('publicEnv', () => {
  it('throws at module load when the reCAPTCHA key is missing and emulators are off', async () => {
    delete process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;
    delete process.env.NEXT_PUBLIC_USE_EMULATORS;
    await expect(import('../env')).rejects.toThrow(/NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY/);
  });

  it('does not throw when emulators are enabled, even without the key', async () => {
    delete process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;
    process.env.NEXT_PUBLIC_USE_EMULATORS = '1';
    const mod = await import('../env');
    expect(mod.publicEnv.useEmulators).toBe(true);
    expect(mod.publicEnv.recaptchaEnterpriseKey).toBeUndefined();
  });

  it('does not throw and exposes the key when the reCAPTCHA key is present', async () => {
    process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY = 'test-recaptcha-key';
    delete process.env.NEXT_PUBLIC_USE_EMULATORS;
    const mod = await import('../env');
    expect(mod.publicEnv.recaptchaEnterpriseKey).toBe('test-recaptcha-key');
    expect(mod.publicEnv.useEmulators).toBe(false);
  });
});
