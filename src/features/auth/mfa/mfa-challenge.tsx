'use client';
import { useEffect, useState } from 'react';
import type { MultiFactorError, UserCredential } from 'firebase/auth';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { useMfaChallenge } from './use-mfa';

export interface MfaChallengeProps {
  mfaError: MultiFactorError;
  onSuccess: (cred: UserCredential) => void;
  onCancel: () => void;
}

/**
 * Sign-in-time TOTP challenge (spec §6). Rendered by `sign-in-form.tsx`
 * in place of the email/password fields once `signInWithEmailAndPassword`
 * throws `auth/multi-factor-auth-required`.
 */
export function MfaChallenge({ mfaError, onSuccess, onCancel }: MfaChallengeProps) {
  const { status, error, beginChallenge, submitCode } = useMfaChallenge();
  const [code, setCode] = useState('');

  useEffect(() => {
    beginChallenge(mfaError);
    // Runs once per challenge instance: `mfaError` is a fresh object from
    // a single failed sign-in attempt, and `beginChallenge` is a stable
    // `useCallback`. Intentionally not re-run on `beginChallenge` identity
    // (it never changes) to avoid re-resolving on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfaError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cred = await submitCode(code);
    if (cred) onSuccess(cred);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Text size="sm" color="secondary">
        Enter the 6-digit code from your authenticator app.
      </Text>
      <Input
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        error={error ?? undefined}
        fullWidth
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} fullWidth>
          Back
        </Button>
        <Button type="submit" loading={status === 'verifying'} disabled={code.length !== 6} fullWidth>
          Verify
        </Button>
      </div>
    </form>
  );
}
