import type { CallableInput } from '@goldstar/platform';

/**
 * The onboarding wizard's accumulated draft, built up across steps by
 * `onboarding-wizard.tsx`'s `useReducer`. Logo files are kept as `File`
 * objects here and uploaded to Storage AFTER `platformCreateOperator`
 * succeeds (`steps/branding.tsx`'s `uploadBrandingAssets`) — they are
 * never part of the callable payload itself.
 */
export interface OnboardingDraft {
  name: string;
  slug: string;
  timezone: string;
  primaryColor: string;
  accentColor: string;
  logoLightFile: File | null;
  logoDarkFile: File | null;
  plan: string;
  features: {
    driveHome: boolean;
    passengerRides: boolean;
    venuePortals: boolean;
    tapToPay: boolean;
    plateOcr: boolean;
    payouts: boolean;
  };
  ownerEmail: string;
  ownerName: string;
}

/**
 * Fresh-operator defaults not exposed as wizard fields (task-3-brief.md):
 * `currency` is fixed at `'USD'` (Goldstar operates US-only today), the
 * operator is never created in sandbox mode from this wizard, and every
 * integration module defaults to the platform's only currently-supported
 * provider for that category (`PAYMENT_PROVIDERS`/`MESSAGING_PROVIDERS`
 * in `@goldstar/platform` are each single-member enums today — there is
 * nothing else to choose from) or the safest baseline (`vision: 'none'`,
 * `accounting: 'csv'`, `scheduling: 'internal'`).
 */
export const CREATE_OPERATOR_DEFAULTS = {
  currency: 'USD' as const,
  isSandbox: false,
  modules: {
    payments: {
      provider: 'stripe' as const,
      chargeModel: 'destination' as const,
      platformFeeBps: 0,
      tipPresets: [18, 20, 25],
      tipPolicy: 'deliverer' as const,
    },
    messaging: { provider: 'twilio' as const },
    scheduling: { provider: 'internal' as const },
    vision: { provider: 'none' as const },
    accounting: { provider: 'csv' as const },
  },
};

/**
 * Composes the wizard's draft into `platformCreateOperator`'s exact input
 * shape (`operatorSchema.omit({ createdAt, updatedAt, createdBy, status })
 * .extend({ ownerEmail, ownerName })` per the installed `@goldstar/platform`
 * v0.3.5 contract — verified directly against `callables.ts`, not assumed
 * from the task brief's sketch).
 *
 * `id` is set to the slug: every consumer of an operator id in this
 * codebase (Firestore doc id, `firestore.rules`' `request.resource.data.id
 * == op` create guard, the Storage branding path `operators/{op}/branding/
 * {file}`, `assumeOperator`) treats the two as the same identifier, and the
 * Functions handler (`platformCreateOperator`) independently enforces this
 * invariant server-side.
 */
export function composeCreateOperatorInput(draft: OnboardingDraft): CallableInput<'platformCreateOperator'> {
  return {
    id: draft.slug,
    name: draft.name,
    slug: draft.slug,
    timezone: draft.timezone,
    currency: CREATE_OPERATOR_DEFAULTS.currency,
    isSandbox: CREATE_OPERATOR_DEFAULTS.isSandbox,
    plan: draft.plan,
    branding: {
      displayName: draft.name,
      primaryColor: draft.primaryColor,
      accentColor: draft.accentColor,
    },
    modules: CREATE_OPERATOR_DEFAULTS.modules,
    features: draft.features,
    ownerEmail: draft.ownerEmail,
    ownerName: draft.ownerName,
  };
}

export const INITIAL_ONBOARDING_DRAFT: OnboardingDraft = {
  name: '',
  slug: '',
  timezone: 'America/Indiana/Indianapolis',
  primaryColor: '#ab6034',
  accentColor: '#ffc30c',
  logoLightFile: null,
  logoDarkFile: null,
  plan: 'standard',
  features: {
    driveHome: true,
    passengerRides: true,
    venuePortals: true,
    tapToPay: false,
    plateOcr: true,
    payouts: true,
  },
  ownerEmail: '',
  ownerName: '',
};
