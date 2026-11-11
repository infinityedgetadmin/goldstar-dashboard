'use client';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Select } from '@/components/ui/forms';
import { Button } from '@/components/ui/buttons';
import type { OnboardingDraft } from '../create-operator';

/**
 * Plan tiers: not constrained by the `@goldstar/platform` contract
 * (`operatorSchema.plan` is a bare `z.string().min(1)`, no enum) — this
 * fixed set of three is a dashboard-only UI decision, disclosed in
 * task-3-report.md. `platformCreateOperator` accepts any non-empty string.
 */
export const PLAN_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'premium', label: 'Premium' },
  { value: 'enterprise', label: 'Enterprise' },
] as const;

const planStepSchema = z.object({ plan: z.string().min(1) });
export type PlanStepFields = z.infer<typeof planStepSchema>;

export interface PlanStepProps {
  draft: OnboardingDraft;
  onNext: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
}

// Plain `useState` + zod, not `react-hook-form` — see identity.tsx's header comment for why.
export function PlanStep({ draft, onNext, onBack }: PlanStepProps) {
  const [plan, setPlan] = useState(draft.plan);
  const [error, setError] = useState<string | undefined>();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = planStepSchema.safeParse({ plan });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    onNext(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="max-w-sm">
        <Select label="Plan" options={[...PLAN_OPTIONS]} value={plan} onChange={(e) => setPlan(e.target.value)} error={error} fullWidth />
      </div>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit">Next</Button>
      </div>
    </form>
  );
}
