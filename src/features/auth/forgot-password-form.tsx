'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { firebase } from '@/lib/firebase/client';
import { authErrorCode, authErrorCopy } from './auth-error-copy';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';

/**
 * `auth/user-not-found` is deliberately treated as success (the same
 * neutral "check your inbox" copy either way) — surfacing that specific
 * code would let a caller enumerate which emails have accounts. Any other
 * failure (invalid email format, network error) is still shown honestly
 * so the user can fix a typo or retry, per this workspace's rule that
 * only a generic fallback should hide detail, not every error.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordResetEmail(firebase().auth, email);
      setSent(true);
    } catch (err) {
      if (authErrorCode(err) === 'auth/user-not-found') {
        setSent(true);
      } else {
        setError(authErrorCopy(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Text size="sm" color="secondary" role="status">
          If an account exists for that email, we&apos;ve sent a password reset link.
        </Text>
        <Link href="/sign-in" className="text-body-sm text-primary-500 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        fullWidth
      />
      {error && (
        <Text size="sm" color="error" role="alert">
          {error}
        </Text>
      )}
      <Button type="submit" loading={submitting} fullWidth>
        Send reset link
      </Button>
      <Link href="/sign-in" className="text-body-sm text-primary-500 text-center hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
