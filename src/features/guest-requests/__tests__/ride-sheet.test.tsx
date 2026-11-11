import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformError, type GuestTicket } from '@goldstar/platform';

// Verified against the INSTALLED @goldstar/platform@0.3.5 dist
// `callables.guestRequestRide`/`guestConfirmRide` schemas. REAL drift from
// a naive port of the drive-home flow (disclosed in task-4-report.md):
// `pickup.geo` is a REQUIRED `{ lat, lng }` on the real
// `guestRequestRide` input, but `GuestTicket` (the guest projection this
// sheet receives as `ticket`) carries no venue geo/coordinates field at
// all — only `venueName: string`. There is no source of a default pickup
// geo on this page. Pickup is therefore resolved through the SAME
// `AddressAutocomplete` mechanism as dropoff (seeded with the venue name as
// its default query text, satisfying the brief's "pickup (venue default)"
// as a prefilled starting point rather than a non-interactive value), so a
// real `{ lat, lng }` is always available before `guestRequestRide` fires.
// `guestConfirmRide`'s input is `{ token }` only — no `termsVersion` (unlike
// drive-home) — confirmed against the same dist file.
const calls: Record<string, ReturnType<typeof vi.fn>> = {
  mapsAutocomplete: vi.fn(async (input: { query: string }) => ({
    suggestions:
      input.query === 'St. Elmo'
        ? [{ id: 'venue1', label: 'St. Elmo, Indianapolis', geo: { lat: 39.76, lng: -86.15 } }]
        : [{ id: 'drop1', label: '200 S Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.16 } }],
  })),
  guestRequestRide: vi.fn(async () => ({
    quote: {
      base: 1200,
      distanceMeters: 3200,
      durationSec: 480,
      amount: 1800,
      breakdown: [{ label: 'Base', amount: 1200 }, { label: 'Passengers', amount: 600 }],
    },
    jobToken: 'RideJobTokenRideJobTok',
  })),
  guestConfirmRide: vi.fn(async () => ({ clientSecret: 'pi_ride_secret', publishableKey: 'pk', total: 1800, tip: 0 })),
};
vi.mock('@/lib/public/callables', () => ({ guestCall: (n: string) => calls[n] }));

vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: vi.fn(async () => ({})) }));
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PaymentElement: () => <div data-testid="pe" />,
  ExpressCheckoutElement: () => null,
  useStripe: () => ({}),
  useElements: () => ({}),
}));

let emitJob: (t: unknown) => void = () => {};
vi.mock('@/lib/public/firebase', () => ({
  subscribeGuestTicket: (_t: string, cb: (t: unknown) => void) => {
    emitJob = cb;
    return () => {};
  },
  publicFirebase: () => ({}),
}));

import { RideSheet } from '../ride-sheet';

const ticket = {
  venueName: 'St. Elmo',
  branding: { primaryColor: '#ab6034', accentColor: '#ffc30c', displayName: 'Goldstar' },
  payment: { currency: 'USD' },
} as unknown as GuestTicket;

async function selectPickupAndDropoff() {
  fireEvent.focus(screen.getByLabelText('Pickup'));
  fireEvent.click(await screen.findByText('St. Elmo, Indianapolis'));
  fireEvent.change(screen.getByLabelText('Dropoff'), { target: { value: '200 S Meridian' } });
  fireEvent.click(await screen.findByText('200 S Meridian St, Indianapolis'));
}

describe('RideSheet', () => {
  it('pickup/dropoff → passengers/accessible → quote → confirm(jobToken) → payment', async () => {
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);

    // Pickup defaults to the venue name and is already resolvable without typing.
    expect(screen.getByLabelText('Pickup')).toHaveValue('St. Elmo');

    await selectPickupAndDropoff();

    fireEvent.click(screen.getByRole('button', { name: 'Increase passengers' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Accessible vehicle' }));

    fireEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    await waitFor(() =>
      expect(calls.guestRequestRide).toHaveBeenCalledWith({
        token: 'AbCdEfGhIjKlMnOpQrStUv',
        pickup: { address: 'St. Elmo, Indianapolis', geo: { lat: 39.76, lng: -86.15 } },
        dropoff: { address: '200 S Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.16 }, placeId: 'drop1' },
        passengers: 2,
        accessible: true,
      })
    );

    expect(await screen.findByText('$18.00')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ride' }));
    await waitFor(() => expect(calls.guestConfirmRide).toHaveBeenCalledWith({ token: 'RideJobTokenRideJobTok' }));
    expect(await screen.findByTestId('pe')).toBeInTheDocument();
  });

  // F1 (final review): editing pickup/dropoff text after a selection was
  // already made must invalidate that selection — otherwise "Get quote"
  // stays enabled while priced against an address the guest no longer sees
  // on screen, and confirming authorizes a ride to the WRONG address with
  // nothing on screen contradicting the guest's belief they're going
  // somewhere else.
  it('F1: editing pickup or dropoff after a selection disables Get quote until a fresh suggestion is picked (both fields); re-selecting re-enables it', async () => {
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    await selectPickupAndDropoff();
    const getQuote = screen.getByRole('button', { name: 'Get quote' });
    expect(getQuote).toBeEnabled();

    // Edit DROPOFF after it was selected — no new suggestion clicked yet.
    fireEvent.change(screen.getByLabelText('Dropoff'), { target: { value: '200 S Meridian St, Indianapolis, unit 4' } });
    expect(getQuote).toBeDisabled();

    // Re-selecting a fresh dropoff suggestion re-enables it (pickup is untouched, still valid).
    fireEvent.change(screen.getByLabelText('Dropoff'), { target: { value: '200 S Meridian' } });
    fireEvent.click(await screen.findByText('200 S Meridian St, Indianapolis'));
    expect(getQuote).toBeEnabled();

    // Edit PICKUP after it was selected (the venue-default suggestion) — invalidates it too.
    fireEvent.change(screen.getByLabelText('Pickup'), { target: { value: 'St. Elmo Annex' } });
    expect(getQuote).toBeDisabled();

    // Clearing a field entirely (not just editing to different text) must also invalidate it.
    fireEvent.change(screen.getByLabelText('Pickup'), { target: { value: 'St. Elmo' } });
    fireEvent.click(await screen.findByText('St. Elmo, Indianapolis'));
    expect(getQuote).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Pickup'), { target: { value: '' } });
    expect(getQuote).toBeDisabled();
  });

  // F7 (final review, WCAG AA): the passengers stepper needs a programmatic
  // value association — a screen-reader user pressing "Increase passengers"
  // otherwise gets no announcement of the new value.
  it('F7: passengers stepper exposes role=spinbutton with aria-valuenow/min/max that tracks the count', () => {
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    const spinbutton = screen.getByRole('spinbutton', { name: 'Passengers' });
    expect(spinbutton).toHaveAttribute('aria-valuenow', '1');
    expect(spinbutton).toHaveAttribute('aria-valuemin', '1');
    expect(spinbutton).toHaveAttribute('aria-valuemax', '8');

    fireEvent.click(screen.getByRole('button', { name: 'Increase passengers' }));
    expect(spinbutton).toHaveAttribute('aria-valuenow', '2');

    fireEvent.click(screen.getByRole('button', { name: 'Decrease passengers' }));
    expect(spinbutton).toHaveAttribute('aria-valuenow', '1');
  });

  it('clamps the passengers stepper to the 1–8 range', async () => {
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    const decrease = screen.getByRole('button', { name: 'Decrease passengers' });
    const increase = screen.getByRole('button', { name: 'Increase passengers' });

    expect(decrease).toBeDisabled(); // starts at 1, the floor
    for (let i = 0; i < 8; i++) fireEvent.click(increase);
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(increase).toBeDisabled(); // clamped at 8, the ceiling
  });

  it('shows sanitized error copy when guestRequestRide rejects', async () => {
    calls.guestRequestRide.mockRejectedValueOnce(new PlatformError('rate_limited', 'internal detail, never shown'));
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    await selectPickupAndDropoff();
    fireEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a moment and try again.');
    expect(screen.queryByText('internal detail, never shown')).toBeNull();
  });

  it('shows the tracking step subscribed on the job token once the live status moves past confirmed', async () => {
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    await selectPickupAndDropoff();
    fireEvent.click(screen.getByRole('button', { name: 'Get quote' }));
    await screen.findByText('$18.00');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm ride' }));
    await screen.findByTestId('pe');

    act(() =>
      emitJob({
        operatorId: 'goldstar',
        ticketId: 'ridejob1',
        venueName: 'St. Elmo',
        jobType: 'passenger_ride',
        status: 'en_route_to_pickup',
        branding: ticket.branding,
        vehicleSummary: 'n/a',
        times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
        payment: { status: 'authorized', base: 1800, tip: 0, tax: 0, fees: 0, total: 1800, currency: 'USD', tipPresets: [] },
        driver: { firstName: 'Jamie', etaAt: '2026-08-23T21:10:00.000Z' },
        features: { driveHome: false, passengerRides: false },
        expiresAt: '2099-01-01T00:00:00.000Z',
        updatedAt: 'x',
      })
    );
    expect(await screen.findByText(/jamie/i)).toBeInTheDocument();
  });

  it('closes on Escape and calls onClose', () => {
    const onClose = vi.fn();
    render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Fix round 1 (Ruling H): resumeToken puts the sheet straight into
  // tracking on the EXISTING job — no pickup/dropoff/passengers/accessible
  // form is ever reachable, and no new request/confirm call is possible.
  describe('resumeToken (Ruling H)', () => {
    it('renders tracking directly on the resumed job token, with no request form', async () => {
      calls.guestRequestRide.mockClear();
      calls.guestConfirmRide.mockClear();
      render(
        <RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />
      );
      expect(screen.getByRole('dialog', { name: 'Ride status' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Pickup')).toBeNull();
      expect(screen.queryByLabelText('Dropoff')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Get quote' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirm ride' })).toBeNull();

      act(() =>
        emitJob({
          operatorId: 'goldstar',
          ticketId: 'ridejob1',
          venueName: 'St. Elmo',
          jobType: 'passenger_ride',
          status: 'en_route_to_pickup',
          branding: ticket.branding,
          vehicleSummary: 'n/a',
          times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
          payment: { status: 'authorized', base: 1800, tip: 0, tax: 0, fees: 0, total: 1800, currency: 'USD', tipPresets: [] },
          driver: { firstName: 'Jamie', etaAt: '2026-08-23T21:10:00.000Z' },
          features: { driveHome: false, passengerRides: false },
          expiresAt: '2099-01-01T00:00:00.000Z',
          updatedAt: 'x',
        })
      );
      expect(await screen.findByText(/jamie/i)).toBeInTheDocument();

      expect(calls.guestRequestRide).not.toHaveBeenCalled();
      expect(calls.guestConfirmRide).not.toHaveBeenCalled();
    });

    it('still closes on Escape while resumed', () => {
      const onClose = vi.fn();
      render(
        <RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} resumeToken="ExistingRideJobToken1" />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  // Addendum round (v0.3.9) — see drive-home-sheet.test.tsx's identical describe block for the
  // full rationale; same shape here minus the terms checkbox (rides have none).
  describe('resume-quote (v0.3.9 addendum)', () => {
    const quotedJob = {
      operatorId: 'goldstar',
      ticketId: 'ridejob1',
      venueName: 'St. Elmo',
      jobType: 'passenger_ride',
      status: 'quoted',
      branding: ticket.branding,
      vehicleSummary: 'n/a',
      times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
      payment: { status: 'none', base: 1800, tip: 0, tax: 0, fees: 0, total: 1800, currency: 'USD', tipPresets: [] },
      ride: {
        quote: { base: 1200, distanceMeters: 3200, durationSec: 480, amount: 1800, breakdown: [{ label: 'Base', amount: 1200 }], expiresAt: '2099-01-01T00:00:00.000Z' },
        dropoff: { address: '200 S Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.16 } },
        passengers: 2,
      },
      features: { driveHome: false, passengerRides: false },
      expiresAt: '2099-01-01T00:00:00.000Z',
      updatedAt: 'x',
    };

    it('reload-at-quoted renders the resumed quote (amount, destination) and a Confirm button — no guestRequestRide call', async () => {
      calls.guestRequestRide.mockClear();
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob(quotedJob));

      expect(await screen.findByText('$18.00')).toBeInTheDocument();
      expect(screen.getByText('200 S Meridian St, Indianapolis')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm ride' })).toBeInTheDocument();
      expect(calls.guestRequestRide).not.toHaveBeenCalled();
    });

    it('confirming a resumed quote calls guestConfirmRide with the RESUME token, then shows the Payment Element', async () => {
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob(quotedJob));
      await screen.findByText('$18.00');

      fireEvent.click(screen.getByRole('button', { name: 'Confirm ride' }));
      await waitFor(() => expect(calls.guestConfirmRide).toHaveBeenCalledWith({ token: 'ExistingRideJobToken1' }));
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
    });

    it('an expired resumed quote falls through to the existing re-request path (Get a new quote reveals the fresh pickup/dropoff step)', async () => {
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() =>
        emitJob({
          ...quotedJob,
          ride: { ...quotedJob.ride, quote: { ...quotedJob.ride.quote, expiresAt: new Date(Date.now() - 1000).toISOString() } },
        })
      );

      expect(await screen.findByText(/quote has expired/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm ride' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /get a new quote/i }));
      expect(screen.getByLabelText('Pickup')).toBeInTheDocument();
      expect(screen.getByLabelText('Dropoff')).toBeInTheDocument();
    });
  });

  // Second addendum round — see drive-home-sheet.test.tsx's identical describe block for the full
  // rationale; no terms here, so no "Terms accepted" line to assert.
  describe('resume-at-confirmed (second addendum round)', () => {
    const confirmedJob = {
      operatorId: 'goldstar',
      ticketId: 'ridejob1',
      venueName: 'St. Elmo',
      jobType: 'passenger_ride',
      status: 'confirmed',
      branding: ticket.branding,
      vehicleSummary: 'n/a',
      times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
      payment: { status: 'pending', base: 1800, tip: 0, tax: 0, fees: 0, total: 1800, currency: 'USD', tipPresets: [] },
      ride: {
        quote: { base: 1200, distanceMeters: 3200, durationSec: 480, amount: 1800, breakdown: [{ label: 'Base', amount: 1200 }] },
        dropoff: { address: '200 S Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.16 } },
        passengers: 2,
      },
      features: { driveHome: false, passengerRides: false },
      expiresAt: '2099-01-01T00:00:00.000Z',
      updatedAt: 'x',
    };

    it('lands on payment automatically, with the quote summary, calling guestConfirmRide with the resume jobToken', async () => {
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob(confirmedJob));

      await waitFor(() => expect(calls.guestConfirmRide).toHaveBeenCalledWith({ token: 'ExistingRideJobToken1' }));
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
      // $18.00 (the total) appears in both the summary and PaymentStep's own total line — the
      // breakdown row ("Base"/"$12.00") is unique to the QuoteView summary, so it's the
      // unambiguous proof the summary rendered at all.
      expect(screen.getByText('Base')).toBeInTheDocument();
      expect(screen.getByText('$12.00')).toBeInTheDocument();
      expect(screen.getByText('200 S Meridian St, Indianapolis')).toBeInTheDocument();
    });

    // Fix round (Major #2, task-45-review.md) — see drive-home-sheet.test.tsx's identical case for
    // the full rationale.
    it('a rejected auto-confirm surfaces sanitized copy AND a discoverable "Try again" retry button — never the misleading tracking copy', async () => {
      calls.guestConfirmRide.mockRejectedValueOnce(new PlatformError('internal', 'raw ride detail, never shown'));
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob(confirmedJob));

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
      expect(screen.queryByText('raw ride detail, never shown')).toBeNull();
      expect(screen.getByText(/couldn.t complete your payment/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      expect(screen.queryByText(/assign a driver shortly/i)).toBeNull();
    });

    it('clicking "Try again" re-calls guestConfirmRide with the same jobToken, and success after retry lands on the payment step', async () => {
      calls.guestConfirmRide.mockRejectedValueOnce(new PlatformError('internal', 'raw ride detail, never shown'));
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob(confirmedJob));
      const retryButton = await screen.findByRole('button', { name: 'Try again' });

      calls.guestConfirmRide.mockClear();
      fireEvent.click(retryButton);
      await waitFor(() => expect(calls.guestConfirmRide).toHaveBeenCalledWith({ token: 'ExistingRideJobToken1' }));
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('does NOT auto-confirm when payment already succeeded — falls through to tracking instead', async () => {
      calls.guestConfirmRide.mockClear();
      render(<RideSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingRideJobToken1" />);
      act(() => emitJob({ ...confirmedJob, payment: { ...confirmedJob.payment, status: 'authorized' } }));

      expect(await screen.findByText(/assign a driver shortly/i)).toBeInTheDocument();
      expect(calls.guestConfirmRide).not.toHaveBeenCalled();
    });
  });
});
