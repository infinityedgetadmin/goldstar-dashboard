import { describe, expect, it } from 'vitest';
import { callables } from '@goldstar/platform';
import { composeCreateOperatorInput, INITIAL_ONBOARDING_DRAFT, type OnboardingDraft } from '../create-operator';

const draft: OnboardingDraft = {
  ...INITIAL_ONBOARDING_DRAFT,
  name: 'Valet Co B',
  slug: 'valetb',
  timezone: 'America/Chicago',
  ownerEmail: 'owner@valetb.example.com',
  ownerName: 'Pat Owner',
};

describe('composeCreateOperatorInput', () => {
  it('sets id to the slug', () => {
    expect(composeCreateOperatorInput(draft)).toMatchObject({ id: 'valetb', slug: 'valetb' });
  });

  it('applies the documented fixed defaults: currency USD, not sandboxed, single-provider modules', () => {
    const input = composeCreateOperatorInput(draft);
    expect(input.currency).toBe('USD');
    expect(input.isSandbox).toBe(false);
    expect(input.modules).toEqual({
      payments: { provider: 'stripe', chargeModel: 'destination', platformFeeBps: 0, tipPresets: [18, 20, 25], tipPolicy: 'deliverer' },
      messaging: { provider: 'twilio' },
      scheduling: { provider: 'internal' },
      vision: { provider: 'none' },
      accounting: { provider: 'csv' },
    });
  });

  it('derives branding.displayName from the company name and carries the chosen colors', () => {
    const input = composeCreateOperatorInput({ ...draft, primaryColor: '#111111', accentColor: '#222222' });
    expect(input.branding).toEqual({ displayName: 'Valet Co B', primaryColor: '#111111', accentColor: '#222222' });
  });

  it('carries the plan and features straight through from the draft', () => {
    const input = composeCreateOperatorInput({ ...draft, plan: 'enterprise', features: { ...draft.features, driveHome: false } });
    expect(input.plan).toBe('enterprise');
    expect(input.features).toMatchObject({ driveHome: false });
  });

  it('passes owner contact fields through', () => {
    const input = composeCreateOperatorInput(draft);
    expect(input.ownerEmail).toBe('owner@valetb.example.com');
    expect(input.ownerName).toBe('Pat Owner');
  });

  it('produces a payload the installed platformCreateOperator contract accepts', () => {
    const input = composeCreateOperatorInput(draft);
    expect(callables.platformCreateOperator.input.safeParse(input).success).toBe(true);
  });

  it('a bad slug fails the contract even though composeCreateOperatorInput does not validate it itself', () => {
    const input = composeCreateOperatorInput({ ...draft, slug: 'Not A Valid Slug!' });
    expect(callables.platformCreateOperator.input.safeParse(input).success).toBe(false);
  });
});

describe('INITIAL_ONBOARDING_DRAFT', () => {
  it('defaults every feature on except tapToPay', () => {
    expect(INITIAL_ONBOARDING_DRAFT.features).toEqual({
      driveHome: true,
      passengerRides: true,
      venuePortals: true,
      tapToPay: false,
      plateOcr: true,
      payouts: true,
    });
  });

  it('defaults the brand colors to the platform palette', () => {
    expect(INITIAL_ONBOARDING_DRAFT.primaryColor).toBe('#ab6034');
    expect(INITIAL_ONBOARDING_DRAFT.accentColor).toBe('#ffc30c');
  });

  it('defaults the plan to standard and has no logo files selected', () => {
    expect(INITIAL_ONBOARDING_DRAFT.plan).toBe('standard');
    expect(INITIAL_ONBOARDING_DRAFT.logoLightFile).toBeNull();
    expect(INITIAL_ONBOARDING_DRAFT.logoDarkFile).toBeNull();
  });
});
