import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';

/**
 * These drive a large multi-section form through `userEvent`/`fireEvent` — dozens of real React
 * commits and validation passes per test. Alone they take ~2s each; under a full-suite parallel run
 * on a loaded machine they exceeded Vitest's 5s default and failed as timeouts, which reads exactly
 * like a real regression and made the whole suite unreliable. The work is genuinely slow, not
 * hung, so the file gets a budget that reflects that rather than the tests being trimmed.
 */
vi.setConfig({ testTimeout: 20_000 });

const setDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});

/**
 * Mirrors real `@firebase/firestore`'s actual rejection (task-5-review.md Critical #1: verified
 * directly against the installed SDK's `parseScalarValue`, which `throw`s `"Unsupported field
 * value: undefined"` for any own key whose value is literally `undefined`) — a bare pass-through
 * mock, which is what this file used before the fix, cannot see this class of bug at all. Throwing
 * here the same way the real SDK does makes every test in this file a structural regression guard
 * for it, not just the ones that assert on it directly.
 */
/** Marker object standing in for the real `firebase/firestore` `deleteField()` `FieldValue`
 * sentinel (fix round 2) — real Firestore accepts this as a field's value (it means "remove this
 * field"), unlike a bare `undefined`, which it rejects outright. Exported so tests can assert a
 * captured payload's field equals this exact sentinel. */
export const DELETE_FIELD_SENTINEL = { __isDeleteFieldSentinel: true } as const;

function assertNoUndefinedFirestoreValue(data: unknown, path = ''): void {
  if (data === DELETE_FIELD_SENTINEL) return; // a legitimate deleteField() marker, not a bare undefined
  if (data === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path || '(root)'})`);
  if (Array.isArray(data)) {
    data.forEach((v, i) => assertNoUndefinedFirestoreValue(v, `${path}[${i}]`));
    return;
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      assertNoUndefinedFirestoreValue(v, path ? `${path}.${k}` : k);
    }
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  deleteField: () => DELETE_FIELD_SENTINEL,
  setDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return setDocMock(ref.path, data);
  },
  updateDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return updateDocMock(ref.path, data);
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

import { VenueForm } from '../venue-form';

const VENUE: Venue = {
  id: 'v1',
  operatorId: 'goldstar',
  name: 'St. Elmo',
  type: 'restaurant',
  status: 'active',
  address: { line1: '127 S Illinois St', city: 'Indianapolis', region: 'IN', postalCode: '46225', country: 'US' },
  geo: { lat: 39.765, lng: -86.158 },
  zones: [{ id: 'A', name: 'Lot A' }],
  rates: {
    valet: { model: 'flat', items: [{ id: 'std', label: 'Valet', amount: 1500 }], taxRateBps: 700, fees: [] },
    driveHome: { base: 2500, perMile: 250, perMinute: 50, minimum: 3900 },
    passengerRide: { base: 1000, perMile: 200, perMinute: 40, minimum: 1500 },
    validations: { allowPartial: true, maxAmount: 1500 },
  },
  sms: {},
  qr: { staticCheckoutEnabled: false },
  // `taxRateBps` became REQUIRED on the contract shape in the 0.4.2 -> 0.4.6 re-vendor; the
  // fixture omitted it and the type-check caught it, which is the required-field mechanism working.
  contract: { model: 'per_ticket', perTicketFee: 500, taxRateBps: 0, terms: '', billingEmail: 'ap@stelmo.example.com', invoiceDay: 1 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

// Fix round 2: a venue that already HAS phone/pms set — the fixture VENUE above never sets either,
// so it can't exercise "clear a previously-set field", only "never had one" (see the round-2 tests
// below, which need both shapes).
const VENUE_WITH_PHONE_AND_PMS: Venue = {
  ...VENUE,
  phone: '+13175550199',
  pms: { provider: 'opera_cloud', hotelId: 'HOTEL1', noPostBehavior: 'block', chargeCode: 'C1' },
};

function fillRequiredCreateFields() {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'St. Elmo' } });
  fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '127 S Illinois St' } });
  fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Indianapolis' } });
  fireEvent.change(screen.getByLabelText('State / region'), { target: { value: 'IN' } });
  fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: '46225' } });
  fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'US' } });
  fireEvent.change(screen.getByLabelText('Billing email'), { target: { value: 'ap@stelmo.example.com' } });
  // Required by `venueSchema.contract`'s superRefine for the default `per_ticket` model (contracts
  // v0.4.6) and deliberately NOT defaulted by the form — a blank is an error the operator resolves.
  fireEvent.change(screen.getByLabelText('Fee per ticket (cents)'), { target: { value: '500' } });
}

beforeEach(() => {
  setDocMock.mockClear();
  updateDocMock.mockClear();
  pushMock.mockClear();
});

describe('VenueForm', () => {
  it('create mode: a blank per_ticket fee blocks the submit AND the error is bound to the fee field', async () => {
    // Plan 8 carry #69's second half. Under contracts v0.4.6 the refinement rejected a blank fee
    // with a PATHLESS issue, which react-hook-form attached to the contract object rather than the
    // fee field — so the form showed nothing and every submit silently did nothing (two e2e venue
    // journeys timed out waiting for a navigation that never came). What this pins is not the
    // rejection (the schema owns that) but the SURFACING: aria-invalid lands on the fee input.
    render(<VenueForm operatorId="goldstar" currency="USD" />);
    fillRequiredCreateFields();
    fireEvent.change(screen.getByLabelText('Fee per ticket (cents)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create venue' }));

    await waitFor(() => expect(screen.getByLabelText('Fee per ticket (cents)')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(setDocMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('create mode: saves a new venue via setDoc with a fresh id, qr defaulted off, and redirects to it', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" />);
    fillRequiredCreateFields();
    fireEvent.click(screen.getByRole('button', { name: 'Create venue' }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [path, payload] = setDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toMatch(/^operators\/goldstar\/venues\/.+/);
    expect(payload).toMatchObject({ operatorId: 'goldstar', name: 'St. Elmo', qr: { staticCheckoutEnabled: false } });
    expect(payload.id).toEqual(expect.any(String));
    expect(payload.createdAt).toEqual(payload.updatedAt);
    expect(pushMock).toHaveBeenCalledWith(`/venues/${payload.id}`);
    // Critical #1 regression: phone/timezone were left blank (fillRequiredCreateFields doesn't set
    // them) — real Firestore rejects an own key whose value is `undefined`; the payload must not
    // even HAVE these keys, not merely resolve them to `undefined` (Object.hasOwn, not toBeUndefined
    // — a payload with `phone: undefined` as an own key would pass `.toBeUndefined()` too, and that
    // exact shape is what crashed the real SDK before this fix).
    expect(Object.hasOwn(payload, 'phone')).toBe(false);
    expect(Object.hasOwn(payload, 'timezone')).toBe(false);
    expect(Object.hasOwn(payload, 'pms')).toBe(false);
    expect(Object.hasOwn(payload, 'pos')).toBe(false);
  });

  it('Critical #1: a nested optional leaf cleared back to blank (a zone capacity) is omitted, not saved as an own key set to undefined — proves the strip is deep, not top-level only', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" />);
    fillRequiredCreateFields();
    fireEvent.click(screen.getByRole('button', { name: 'Add zone' }));
    fireEvent.change(screen.getByLabelText(/Zone name/), { target: { value: 'Lot A' } }); // zone.name is required (min(1))
    const capacityInput = screen.getByLabelText(/Zone capacity/);
    fireEvent.change(capacityInput, { target: { value: '10' } });
    fireEvent.change(capacityInput, { target: { value: '' } }); // clears it back — reproduces {...zone, capacity: undefined}
    fireEvent.click(screen.getByRole('button', { name: 'Create venue' }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = setDocMock.mock.calls[0] as [string, { zones: Record<string, unknown>[] }];
    expect(payload.zones).toHaveLength(1);
    expect(Object.hasOwn(payload.zones[0]!, 'capacity')).toBe(false);
  });

  it('Fix round 2 (Major): clearing a PREVIOUSLY-SET phone on edit sends deleteField(), not an omitted key (which updateDoc would treat as "leave unchanged")', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE_WITH_PHONE_AND_PMS} />);
    expect(screen.getByLabelText('Phone')).toHaveValue('+13175550199');
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.phone).toBe(DELETE_FIELD_SENTINEL);
  });

  it('Fix round 2 (Major): toggling a previously-enabled PMS integration off sends deleteField() for pms, not an omitted key', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE_WITH_PHONE_AND_PMS} />);
    expect(screen.getByLabelText('Enable PMS integration')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Enable PMS integration')); // toggle off
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.pms).toBe(DELETE_FIELD_SENTINEL);
  });

  it('Fix round 2 (Major): a field that was NEVER set on the venue stays plain-omitted on edit — no deleteField() spam for fields that have nothing to delete', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />); // VENUE has no timezone, no pms
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.hasOwn(payload, 'timezone')).toBe(false);
    expect(Object.hasOwn(payload, 'pms')).toBe(false);
    expect(Object.hasOwn(payload, 'pos')).toBe(false);
  });

  it('edit mode: pre-fills every general field from the venue', () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />);
    expect(screen.getByLabelText('Name')).toHaveValue('St. Elmo');
    expect(screen.getByLabelText('Address line 1')).toHaveValue('127 S Illinois St');
    expect(screen.getByLabelText('City')).toHaveValue('Indianapolis');
    expect(screen.getByLabelText('Billing email')).toHaveValue('ap@stelmo.example.com');
  });

  it('edit mode: saves via updateDoc, excluding id/operatorId/qr from the payload (StaticQrPanel owns qr)', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'St. Elmo Steak House' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar/venues/v1');
    expect(payload).toMatchObject({ name: 'St. Elmo Steak House' });
    expect(payload).not.toHaveProperty('qr');
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('operatorId');
    // Critical #1: VENUE has no pms/pos and neither is toggled on in this test — defaultsFrom seeds
    // both as own keys set to `undefined`; the payload must not carry them at all.
    expect(Object.hasOwn(payload, 'pms')).toBe(false);
    expect(Object.hasOwn(payload, 'pos')).toBe(false);
  });

  it('blocks submit and shows an error summary on an invalid billing email, without calling updateDoc', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />);
    fireEvent.change(screen.getByLabelText('Billing email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(screen.getByText('Fix the highlighted fields before saving.')).toBeInTheDocument());
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('a blank optional phone/timezone field validates (preprocessed, not rejected by e164Schema) AND is omitted from the saved payload, not saved as an own key set to undefined (Critical #1)', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.hasOwn(payload, 'phone')).toBe(false);
    expect(Object.hasOwn(payload, 'timezone')).toBe(false);
  });

  it('enabling PMS shows Opera Cloud fields and includes pms in the saved payload', async () => {
    render(<VenueForm operatorId="goldstar" currency="USD" venue={VENUE} />);
    fireEvent.click(screen.getByLabelText('Enable PMS integration'));
    fireEvent.change(screen.getByLabelText('Hotel ID'), { target: { value: 'HOTEL123' } });
    fireEvent.change(screen.getByLabelText('Charge code'), { target: { value: 'VALET' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save venue' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.pms).toMatchObject({ provider: 'opera_cloud', hotelId: 'HOTEL123', chargeCode: 'VALET', noPostBehavior: 'block' });
  });
});
