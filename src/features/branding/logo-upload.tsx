'use client';
import { useState, type ChangeEvent } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { Text } from '@/components/ui/typography';

export interface LogoUploadProps {
  operatorId: string;
  kind: 'light' | 'dark';
  currentPath?: string;
}

const ACCEPTED_LOGO_TYPES = 'image/png,image/jpeg,image/webp';

/**
 * Uploads immediately on file selection (no separate "save" step) — Storage path, not a
 * resolved download URL, is written to `branding.logo{Light,Dark}Path` per the brief
 * ("storing PATHS"). `storage.rules`' `operators/{op}/branding/{file}` write rule is
 * `isAdmin() && isImage()` with no create-only constraint, so re-uploading the same fixed
 * filename (`logo-light.png` / `logo-dark.png`) cleanly overwrites the previous logo —
 * same filename convention `features/platform/steps/branding.tsx`'s onboarding upload
 * already uses, so a logo set during onboarding and later replaced here lands at the same
 * path both times.
 */
export function LogoUpload({ operatorId, kind, currentPath }: LogoUploadProps) {
  const [busy, setBusy] = useState(false);
  const inputId = `logo-upload-${kind}`;
  const label = kind === 'light' ? 'Upload light-mode logo' : 'Upload dark-mode logo';

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setBusy(true);
    try {
      const { db, storage } = firebase();
      const path = `operators/${operatorId}/branding/logo-${kind}.png`;
      await uploadBytes(ref(storage, path), file, { contentType: file.type });
      const field = kind === 'light' ? 'branding.logoLightPath' : 'branding.logoDarkPath';
      await updateDoc(doc(db, `operators/${operatorId}`), { [field]: path, updatedAt: new Date().toISOString() });
      toast.success(`${kind === 'light' ? 'Light' : 'Dark'} logo updated.`);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="border-border text-text-secondary hover:bg-bg-secondary flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border px-4 text-body-sm font-medium transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        aria-disabled={busy}
      >
        {busy ? 'Uploading…' : label}
        <input id={inputId} type="file" accept={ACCEPTED_LOGO_TYPES} className="sr-only" onChange={handleChange} disabled={busy} />
      </label>
      {currentPath && (
        <Text size="xs" color="tertiary">
          Current: {currentPath}
        </Text>
      )}
    </div>
  );
}
