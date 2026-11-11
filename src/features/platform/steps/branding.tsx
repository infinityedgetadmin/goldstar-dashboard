'use client';
import { useMemo, type ChangeEvent, type CSSProperties } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { cssVariables, operatorTheme } from '@goldstar/platform/tokens';
import { hexColorSchema } from '@goldstar/platform';
import { z } from 'zod';
import { firebase } from '@/lib/firebase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status-pill';
import { Text } from '@/components/ui/typography';
import { formatMoney } from '@/lib/format';
import { PLATFORM_NAV } from '@/lib/nav';
import type { OnboardingDraft } from '../create-operator';

export const brandingFieldsSchema = z.object({
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
});

/**
 * Uploads any selected logo files to Storage — deliberately called AFTER
 * `platformCreateOperator` succeeds (task-3-brief.md's stated ordering:
 * identity → plan → modules → create → branding upload → invite sent), not
 * before. No-ops when neither file was selected, so the given onboarding
 * test (which never touches the logo pickers) never calls into Storage.
 * `storage.rules`' `operators/{op}/branding/{file}` path already allows
 * `isPlatformAdmin()` writes unconditionally (verified directly against
 * `storage.rules` — no rules change needed for this ordering).
 */
export async function uploadBrandingAssets(
  operatorId: string,
  files: Pick<OnboardingDraft, 'logoLightFile' | 'logoDarkFile'>
): Promise<void> {
  // Early return BEFORE calling firebase() — not just before uploadBytes() — so the no-logos path
  // (the wizard's given test) never touches the Firebase SDK at all. firebase() eagerly calls
  // initializeApp/getAuth/getFirestore/getFunctions/getStorage; in a test environment with no real
  // NEXT_PUBLIC_FIREBASE_* config, that throws, which the wizard's catch block turns into a toast
  // instead of the expected confirmation screen. Found via task-3's onboarding-wizard test failing
  // with the create() call verified but the confirmation text never appearing.
  if (!files.logoLightFile && !files.logoDarkFile) return;
  const { storage } = firebase();
  const uploads: Promise<unknown>[] = [];
  if (files.logoLightFile) {
    uploads.push(uploadBytes(ref(storage, `operators/${operatorId}/branding/logo-light.png`), files.logoLightFile, { contentType: files.logoLightFile.type }));
  }
  if (files.logoDarkFile) {
    uploads.push(uploadBytes(ref(storage, `operators/${operatorId}/branding/logo-dark.png`), files.logoDarkFile, { contentType: files.logoDarkFile.type }));
  }
  await Promise.all(uploads);
}

export interface LogoPickersProps {
  logoLightFile: File | null;
  logoDarkFile: File | null;
  onLogoLightChange: (file: File | null) => void;
  onLogoDarkChange: (file: File | null) => void;
}

const ACCEPTED_LOGO_TYPES = 'image/png,image/jpeg,image/webp';

function LogoPicker({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File | null) => void }) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.files?.[0] ?? null);
  const inputId = `logo-picker-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={inputId}
        className="border-border text-text-secondary hover:bg-bg-secondary flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg border px-4 text-body-sm font-medium transition-colors"
      >
        {label}
        <input id={inputId} type="file" accept={ACCEPTED_LOGO_TYPES} className="sr-only" onChange={handleChange} />
      </label>
      {file && (
        <Text size="xs" color="tertiary">
          Selected: {file.name}
        </Text>
      )}
    </div>
  );
}

/** Deferred (not-yet-uploaded) light/dark logo file pickers for the identity step. */
export function LogoPickers({ logoLightFile, logoDarkFile, onLogoLightChange, onLogoDarkChange }: LogoPickersProps) {
  return (
    <div className="flex flex-wrap gap-4">
      <LogoPicker label="Upload light-mode logo" file={logoLightFile} onChange={onLogoLightChange} />
      <LogoPicker label="Upload dark-mode logo" file={logoDarkFile} onChange={onLogoDarkChange} />
    </div>
  );
}

export interface LivePreviewPanelProps {
  displayName: string;
  primaryColor: string;
  accentColor: string;
}

/**
 * Live preview of the operator's chosen brand colors: a sidebar mockup
 * (task-3-brief.md's "AppShell sidebar") plus a sample ticket card, both
 * themed via `cssVariables(operatorTheme(...))` — same pattern
 * `src/features/guest-ticket/ticket-view.tsx` uses to theme the guest
 * surface from an operator's live branding.
 *
 * Deliberately NOT the real `Sidebar`/`AppShell` components: `Sidebar`
 * calls `usePathname()` and `AppShell`'s `Topbar` calls `useSession()`,
 * both of which require app-router/session context this wizard's own test
 * (`__tests__/onboarding-wizard.test.tsx`, given verbatim by the task
 * brief) does not provide — its `vi.mock('next/navigation', ...)` stubs
 * only `useRouter`. Reproducing the sidebar's visual structure directly
 * (same nav rows/icons from `PLATFORM_NAV`, non-interactive) previews the
 * real shell's look without that dependency. Disclosed in task-3-report.md.
 */
export function LivePreviewPanel({ displayName, primaryColor, accentColor }: LivePreviewPanelProps) {
  const vars = useMemo(() => cssVariables(operatorTheme({ primaryColor, accentColor })), [primaryColor, accentColor]);

  return (
    <div style={vars as CSSProperties} className="border-border overflow-hidden rounded-lg border" aria-hidden>
      <div className="flex h-64 overflow-hidden">
        <div className="flex w-40 shrink-0 flex-col border-r border-border bg-bg-primary">
          <div className="flex items-center gap-2 border-b border-border px-3 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-500 font-display text-ui-xs font-semibold text-white">
              {(displayName || 'GV').slice(0, 2).toUpperCase()}
            </div>
            <Text size="xs" weight="semibold" className="truncate">
              {displayName || 'New operator'}
            </Text>
          </div>
          <div className="flex-1 space-y-1 overflow-hidden p-2">
            {PLATFORM_NAV.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-ui-xs font-medium',
                    i === 0 ? 'bg-primary-50 text-primary-700' : 'text-text-secondary'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-bg-secondary p-4">
          <Card padding="sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle as="h4">Ticket #A104</CardTitle>
                <StatusPill label="Parked" tone="positive" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <Text size="sm">Honda Civic · Blue</Text>
              <Text size="sm" color="tertiary">
                Zone A · {formatMoney(1500)}
              </Text>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="border-border bg-bg-secondary border-t px-3 py-1.5 text-center">
        <Text size="xs" color="tertiary">
          Live preview
        </Text>
      </div>
    </div>
  );
}
