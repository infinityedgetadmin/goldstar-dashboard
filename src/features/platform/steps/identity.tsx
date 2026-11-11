'use client';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';
import { operatorSchema } from '@goldstar/platform';
import { Input } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import type { OnboardingDraft } from '../create-operator';
import { brandingFieldsSchema, LivePreviewPanel, LogoPickers } from './branding';

// Reuses the contract's own `id`/`slug` regex and `name` constraint (`operatorSchema.shape`) rather
// than re-deriving them — code-to-the-contract, not a hand-rolled approximation of it.
const identityStepSchema = z
  .object({
    name: operatorSchema.shape.name,
    slug: operatorSchema.shape.slug,
    timezone: operatorSchema.shape.timezone,
  })
  .extend(brandingFieldsSchema.shape);

export type IdentityStepFields = z.infer<typeof identityStepSchema>;

export interface IdentityStepProps {
  draft: OnboardingDraft;
  onNext: (patch: Partial<OnboardingDraft>) => void;
  /** Logo selection updates the draft immediately — it isn't gated behind this step's submit. */
  onLogoLightChange: (file: File | null) => void;
  onLogoDarkChange: (file: File | null) => void;
}

/**
 * Plain `useState` + zod `.safeParse()` on submit — deliberately NOT
 * `react-hook-form` (disclosed in task-3-report.md): it was listed in
 * `package.json` but, verified by grep, imported by zero files in this
 * repo before this task. Adding it here pushed `check:guest-bundle`'s
 * first-load JS for `/t/[token]` from 299.28 KB to 304.72 KB, over its
 * 300 KB budget — confirmed by building with/without the wizard's files.
 * Something in Turbopack's chunk-splitting shares that module's chunk
 * with the guest route despite `(platform)` and `(public)` being
 * separate route groups. Every step below uses controlled inputs + a
 * step-scoped zod schema instead, at zero new dependency-graph cost.
 */
export function IdentityStep({ draft, onNext, onLogoLightChange, onLogoDarkChange }: IdentityStepProps) {
  const [fields, setFields] = useState<IdentityStepFields>({
    name: draft.name,
    slug: draft.slug,
    timezone: draft.timezone,
    primaryColor: draft.primaryColor,
    accentColor: draft.accentColor,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof IdentityStepFields, string>>>({});

  const setField = <K extends keyof IdentityStepFields>(key: K) => (e: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = identityStepSchema.safeParse(fields);
    if (!parsed.success) {
      const next: Partial<Record<keyof IdentityStepFields, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof IdentityStepFields] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    onNext(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Input label="Company name" value={fields.name} onChange={setField('name')} error={errors.name} fullWidth />
          <Input
            label="Slug"
            helperText="Lowercase letters, numbers, and hyphens only."
            value={fields.slug}
            onChange={setField('slug')}
            error={errors.slug}
            fullWidth
          />
          <Input
            label="Timezone"
            helperText="IANA timezone, e.g. America/Indiana/Indianapolis."
            value={fields.timezone}
            onChange={setField('timezone')}
            error={errors.timezone}
            fullWidth
          />
          <div className="grid grid-cols-2 gap-4">
            <Input type="color" label="Primary color" value={fields.primaryColor} onChange={setField('primaryColor')} error={errors.primaryColor} fullWidth />
            <Input type="color" label="Accent color" value={fields.accentColor} onChange={setField('accentColor')} error={errors.accentColor} fullWidth />
          </div>
          <div className="space-y-2">
            <Text size="sm" weight="medium">
              Logos
            </Text>
            <LogoPickers
              logoLightFile={draft.logoLightFile}
              logoDarkFile={draft.logoDarkFile}
              onLogoLightChange={onLogoLightChange}
              onLogoDarkChange={onLogoDarkChange}
            />
          </div>
        </div>
        <LivePreviewPanel displayName={fields.name} primaryColor={fields.primaryColor} accentColor={fields.accentColor} />
      </div>
      <div className="flex justify-end">
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}
