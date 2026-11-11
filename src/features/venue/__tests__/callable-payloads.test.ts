import { describe, expect, it } from 'vitest';
import { callables } from '@goldstar/platform';

/**
 * T1b fix round, MINOR-2: most of this file retired. The component tests now enforce the
 * installed contracts BY CONSTRUCTION — their callable mock parses the real payload against the
 * real input schema and the resolved fixture against the real output schema
 * (`contract-checked-callable.ts`) — so the hand-written payload literals that used to mirror
 * component behavior are gone. Every payload shape a component can send — including all four
 * validation types (the comp case is pinned by issue-validation-dialog.test.tsx, added in the
 * micro-fix round) — is enforced there. What remains here is only what no component test can
 * express:
 *
 * 1. Money-boundary rejections: payloads the components can never produce (their own validation
 *    blocks them first), proving the CONTRACT rejects them independently of the client.
 * 2. Ride-field requirements the FORM enforces, asserted against the contract directly — the
 *    contract itself accepts a partial ride payload (all three fields are `.optional()` so one
 *    input can serve all three `kind`s; the HANDLER refines them to required for `kind: 'ride'`).
 *    A component test can only prove our form refuses to submit; these prove what the wire
 *    actually accepts, which is the thing a future handler change would move.
 *
 * The gap-1 tripwire that used to live here is GONE, on purpose: v0.4.0 added
 * `eta`/`partySize`/`vip` to `venueHostRequest`'s input, the tripwire fired exactly as designed,
 * and it was deleted in the same commit that re-vendored — along with `composePreArrivalNote`,
 * the fold-in it existed to police.
 */
describe('venue callable contract boundaries not reachable through component tests', () => {
  it('v0.4.0: pre-arrival eta/partySize/vip now SURVIVE the contract instead of being stripped', () => {
    const parsed = callables.venueHostRequest.input.parse({
      venueId: 'v1',
      kind: 'pre_arrival',
      name: 'Ana',
      eta: '19:30',
      partySize: 6,
      vip: true,
    });
    expect(parsed).toMatchObject({ eta: '19:30', partySize: 6, vip: true });
  });

  it('v0.4.0: a ride payload carrying dropoff/passengers/accessible parses', () => {
    expect(() =>
      callables.venueHostRequest.input.parse({
        venueId: 'v1',
        kind: 'ride',
        name: 'Ana',
        dropoff: { address: '1 Monument Circle, Indianapolis', geo: { lat: 39.768, lng: -86.158 } },
        passengers: 4,
        accessible: true,
      })
    ).not.toThrow();
  });

  it('the contract rejects a malformed dropoff (blank address, out-of-range geo) and an out-of-band party size', () => {
    const base = { venueId: 'v1', kind: 'ride' as const, passengers: 2, accessible: false };
    expect(callables.venueHostRequest.input.safeParse({ ...base, dropoff: { address: '', geo: { lat: 39.7, lng: -86.1 } } }).success).toBe(false);
    expect(callables.venueHostRequest.input.safeParse({ ...base, dropoff: { address: 'x', geo: { lat: 999, lng: -86.1 } } }).success).toBe(false);
    expect(callables.venueHostRequest.input.safeParse({ ...base, passengers: 9, dropoff: { address: 'x', geo: { lat: 39.7, lng: -86.1 } } }).success).toBe(false);
    expect(callables.venueHostRequest.input.safeParse({ ...base, passengers: 0, dropoff: { address: 'x', geo: { lat: 39.7, lng: -86.1 } } }).success).toBe(false);
  });

  it('MONEY: the contract itself rejects float and negative validation amounts (unreachable via components — their own input validation blocks these first)', () => {
    expect(callables.venueIssueValidation.input.safeParse({ venueId: 'v1', type: 'partial', amount: 12.5 }).success).toBe(false);
    expect(callables.venueIssueValidation.input.safeParse({ venueId: 'v1', type: 'partial', amount: -100 }).success).toBe(false);
  });
});
