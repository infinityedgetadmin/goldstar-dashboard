'use client';
import { useEffect, useState } from 'react';
import { toDataURL } from 'qrcode';
import type { User as FirebaseUser } from 'firebase/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { useMfaEnrollment } from './use-mfa';

export interface EnrollTotpDialogProps {
  user: FirebaseUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once enrollment succeeds, before the dialog closes itself. */
  onEnrolled?: () => void;
}

/**
 * TOTP enrollment dialog (spec §6). `pr-12` on the header clears the
 * Dialog primitive's absolutely-positioned 44px close button (ledger
 * carry from Plan 3/4a review: `dialog.tsx`'s close button sits at
 * `top-2 right-2` with `h-11 w-11` — any title text long enough to reach
 * that corner would render underneath it without this).
 */
export function EnrollTotpDialog({ user, open, onOpenChange, onEnrolled }: EnrollTotpDialogProps) {
  const { status, secret, qrCodeUrl, error, start, verify, reset } = useMfaEnrollment(user);
  const [code, setCode] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      start();
    } else {
      reset();
      setCode('');
      setQrDataUrl(null);
    }
    // `start`/`reset` are stable (useCallback with tracked deps) — only `open` should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!qrCodeUrl) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    toDataURL(qrCodeUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrCodeUrl]);

  useEffect(() => {
    if (status === 'enrolled') {
      onEnrolled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Set up two-factor authentication</DialogTitle>
          <DialogDescription>
            Scan this code with an authenticator app (Google Authenticator, 1Password, Authy) and enter the 6-digit
            code it generates.
          </DialogDescription>
        </DialogHeader>

        {status === 'starting' && (
          <Text size="sm" color="secondary">
            Generating your code…
          </Text>
        )}

        {status === 'unsupported' && (
          <Text size="sm" color="secondary" role="alert">
            Two-factor authentication isn&apos;t enabled for this project yet. Contact your platform admin.
          </Text>
        )}

        {(status === 'ready' || status === 'verifying' || (status === 'error' && secret)) && (
          <div className="flex flex-col items-center gap-4">
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="Scan this QR code with your authenticator app" width={220} height={220} />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-lg bg-bg-secondary">
                <Text size="sm" color="tertiary">
                  Loading QR code…
                </Text>
              </div>
            )}
            {secret && (
              <Text size="xs" color="tertiary" className="text-center break-all">
                Can&apos;t scan? Enter this key manually: <span className="font-medium">{secret.secretKey}</span>
              </Text>
            )}
            <Input
              label="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              error={error ?? undefined}
              fullWidth
            />
          </div>
        )}

        {status === 'enrolled' && (
          <Text size="sm" color="success" role="status">
            Two-factor authentication is enabled for your account.
          </Text>
        )}

        {status === 'error' && !secret && (
          <Text size="sm" color="error" role="alert">
            {error}
          </Text>
        )}

        <DialogFooter>
          {status === 'enrolled' || status === 'unsupported' ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => verify(code)} loading={status === 'verifying'} disabled={code.length !== 6}>
                Verify &amp; enable
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
