'use client';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';
import { Input } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import type { OnboardingDraft } from '../create-operator';

const inviteOwnerStepSchema = z.object({
  ownerEmail: z.string().email('Enter a valid email address.'),
  ownerName: z.string().min(1, 'Owner name is required.'),
});
export type InviteOwnerStepFields = z.infer<typeof inviteOwnerStepSchema>;

export interface InviteOwnerStepProps {
  draft: OnboardingDraft;
  submitting: boolean;
  onSubmit: (fields: InviteOwnerStepFields) => void;
  onBack: () => void;
}

// Plain `useState` + zod, not `react-hook-form` — see identity.tsx's header comment for why.
export function InviteOwnerStep({ draft, submitting, onSubmit, onBack }: InviteOwnerStepProps) {
  const [fields, setFields] = useState<InviteOwnerStepFields>({ ownerEmail: draft.ownerEmail, ownerName: draft.ownerName });
  const [errors, setErrors] = useState<Partial<Record<keyof InviteOwnerStepFields, string>>>({});

  const setField = <K extends keyof InviteOwnerStepFields>(key: K) => (e: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = inviteOwnerStepSchema.safeParse(fields);
    if (!parsed.success) {
      const next: Partial<Record<keyof InviteOwnerStepFields, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof InviteOwnerStepFields] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-6">
      <div className="space-y-4">
        <Input type="email" label="Owner email" value={fields.ownerEmail} onChange={setField('ownerEmail')} error={errors.ownerEmail} fullWidth />
        <Input label="Owner name" value={fields.ownerName} onChange={setField('ownerName')} error={errors.ownerName} fullWidth />
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={submitting}>
          Back
        </Button>
        <Button type="submit" loading={submitting}>
          Create operator
        </Button>
      </div>
    </form>
  );
}
