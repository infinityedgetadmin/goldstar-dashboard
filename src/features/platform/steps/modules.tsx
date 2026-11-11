'use client';
import { useState, type FormEvent } from 'react';
import { operatorFeaturesSchema } from '@goldstar/platform';
import type { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import type { OnboardingDraft } from '../create-operator';

// Reuses the contract's own `operatorFeaturesSchema` directly — this step collects exactly the
// `features` object `platformCreateOperator` expects, no re-derivation.
type ModulesStepFields = z.infer<typeof operatorFeaturesSchema>;

const FEATURE_LABELS: { key: keyof ModulesStepFields; label: string; hint: string }[] = [
  { key: 'driveHome', label: 'Drive-home', hint: 'Guests can request their vehicle driven to them.' },
  { key: 'passengerRides', label: 'Passenger rides', hint: 'On-demand rides for guests without their own vehicle.' },
  { key: 'venuePortals', label: 'Venue portals', hint: 'Venue staff can request pickups and issue validations.' },
  { key: 'tapToPay', label: 'Tap to pay', hint: 'Attendants can take contactless payment on a phone.' },
  { key: 'plateOcr', label: 'Plate OCR', hint: 'Automatic license-plate capture at check-in.' },
  { key: 'payouts', label: 'Payouts', hint: 'Daily Stripe payouts to workers for tips/wages.' },
];

export interface ModulesStepProps {
  draft: OnboardingDraft;
  onNext: (patch: Partial<OnboardingDraft>) => void;
  onBack: () => void;
}

// Plain `useState` + zod, not `react-hook-form` — see identity.tsx's header comment for why.
export function ModulesStep({ draft, onNext, onBack }: ModulesStepProps) {
  const [features, setFeatures] = useState<ModulesStepFields>(draft.features);

  const toggle = (key: keyof ModulesStepFields) => setFeatures((f) => ({ ...f, [key]: !f[key] }));

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Every field here is a plain boolean toggle seeded from valid defaults — `safeParse` can only
    // fail if `operatorFeaturesSchema` itself changes shape, in which case surfacing nothing (rather
    // than a confusing generic error on a form with no visibly-wrong field) is the safer failure mode.
    const parsed = operatorFeaturesSchema.safeParse(features);
    if (!parsed.success) return;
    onNext({ features: parsed.data });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-3">
        {FEATURE_LABELS.map(({ key, label, hint }) => (
          <div key={key} className="flex items-start gap-3">
            <Checkbox id={`feature-${key}`} checked={features[key]} onCheckedChange={() => toggle(key)} aria-label={label} />
            <label htmlFor={`feature-${key}`} className="cursor-pointer pt-2.5">
              <Text size="sm" weight="medium" as="span" color="primary" className="block">
                {label}
              </Text>
              <Text size="xs" color="tertiary" as="span" className="block">
                {hint}
              </Text>
            </label>
          </div>
        ))}
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
