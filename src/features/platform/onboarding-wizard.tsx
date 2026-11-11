'use client';
import { useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Stepper } from '@/components/ui/stepper';
import { Button } from '@/components/ui/buttons';
import { Heading, Text } from '@/components/ui/typography';
import { composeCreateOperatorInput, INITIAL_ONBOARDING_DRAFT, type OnboardingDraft } from './create-operator';
import { uploadBrandingAssets } from './steps/branding';
import { IdentityStep } from './steps/identity';
import { PlanStep } from './steps/plan';
import { ModulesStep } from './steps/modules';
import { InviteOwnerStep, type InviteOwnerStepFields } from './steps/invite-owner';

const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'plan', label: 'Plan' },
  { key: 'modules', label: 'Modules' },
  { key: 'invite-owner', label: 'Owner' },
] as const;

type DraftAction = { type: 'patch'; patch: Partial<OnboardingDraft> };

function draftReducer(state: OnboardingDraft, action: DraftAction): OnboardingDraft {
  switch (action.type) {
    case 'patch':
      return { ...state, ...action.patch };
    default:
      return state;
  }
}

/**
 * Platform-admin operator onboarding wizard (task-3-brief.md). Step order:
 * identity (name/slug/timezone + brand colors/logos + live preview) → plan
 * → modules (feature toggles) → invite-owner (owner contact, submits the
 * `platformCreateOperator` callable). Logo uploads happen AFTER creation
 * succeeds (`steps/branding.tsx`'s `uploadBrandingAssets`), then a
 * confirmation screen replaces the wizard.
 *
 * `draft` is `useReducer`-managed per the brief; step navigation
 * (`stepIndex`) is plain `useState` since it's not part of the data being
 * accumulated — only the draft itself needs the reducer's merge semantics.
 */
export function OnboardingWizard() {
  const router = useRouter();
  const [draft, dispatch] = useReducer(draftReducer, INITIAL_ONBOARDING_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<{ operatorId: string; inviteId: string } | null>(null);

  const patch = (p: Partial<OnboardingDraft>) => dispatch({ type: 'patch', patch: p });
  const goNext = () => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const handleCreate = async (ownerFields: InviteOwnerStepFields) => {
    const finalDraft: OnboardingDraft = { ...draft, ...ownerFields };
    patch(ownerFields);
    setSubmitting(true);
    try {
      const input = composeCreateOperatorInput(finalDraft);
      const result = await callable('platformCreateOperator')(input);
      await uploadBrandingAssets(result.operatorId, finalDraft);
      setConfirmation(result);
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="max-w-sm space-y-4">
        <Heading level={2} variant="heading-sm">
          Operator created
        </Heading>
        <Text size="sm">
          Invitation sent to {draft.ownerEmail}. They&apos;ll receive an email to finish setting up their account.
        </Text>
        <Button onClick={() => router.push(`/operators/${confirmation.operatorId}`)}>View operator</Button>
      </div>
    );
  }

  const currentKey = STEPS[stepIndex]!.key;

  return (
    <div className="space-y-8">
      <Stepper steps={STEPS.map(({ key, label }) => ({ key, label }))} currentIndex={stepIndex} />
      {currentKey === 'identity' && (
        <IdentityStep
          draft={draft}
          onNext={(patchValues) => {
            patch(patchValues);
            goNext();
          }}
          onLogoLightChange={(file) => patch({ logoLightFile: file })}
          onLogoDarkChange={(file) => patch({ logoDarkFile: file })}
        />
      )}
      {currentKey === 'plan' && (
        <PlanStep
          draft={draft}
          onNext={(patchValues) => {
            patch(patchValues);
            goNext();
          }}
          onBack={goBack}
        />
      )}
      {currentKey === 'modules' && (
        <ModulesStep
          draft={draft}
          onNext={(patchValues) => {
            patch(patchValues);
            goNext();
          }}
          onBack={goBack}
        />
      )}
      {currentKey === 'invite-owner' && <InviteOwnerStep draft={draft} submitting={submitting} onSubmit={handleCreate} onBack={goBack} />}
    </div>
  );
}
