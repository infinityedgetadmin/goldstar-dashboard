import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformError, type GuestTicket } from '@goldstar/platform';

// Verified against the INSTALLED @goldstar/platform@0.3.5 dist (node_modules/
// @goldstar/platform/dist/index.d.ts) `callables.mapsAutocomplete` /
// `guestRequestDriveHome` / `guestConfirmDriveHome` schemas — the brief's own
// fixture shapes below match the real input/output schemas field-for-field
// (no drift to disclose for this flow; see task-4-report.md for the one real
// drift found, in `guestRequestRide`'s required `pickup.geo`).
const calls: Record<string, ReturnType<typeof vi.fn>> = {
  mapsAutocomplete: vi.fn(async () => ({
    suggestions: [{ id: 's1', label: '1 Main St, Indianapolis', geo: { lat: 39.7, lng: -86.1 } }],
  })),
  guestRequestDriveHome: vi.fn(async () => ({
    quote: {
      base: 2500,
      distanceMeters: 8046,
      durationSec: 900,
      amount: 4500,
      breakdown: [{ label: 'Base', amount: 2500 }],
    },
    jobToken: 'JobTokenJobTokenJobTok',
  })),
  guestConfirmDriveHome: vi.fn(async () => ({ clientSecret: 'pi_x_secret', publishableKey: 'pk', total: 4815, tip: 0 })),
  guestCancel: vi.fn(async () => ({ ok: true })),
};
vi.mock('@/lib/public/callables', () => ({ guestCall: (n: string) => calls[n] }));

// `@stripe/stripe-js/pure` (not the bare `@stripe/stripe-js` entry — see
// use-stripe-loader.ts's own JSDoc for why) is what `payment-step.tsx`
// actually imports via the shared `useStripeLoader` hook.
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

import { DriveHomeSheet } from '../drive-home-sheet';

const ticket = {
  branding: { primaryColor: '#ab6034', accentColor: '#ffc30c', displayName: 'Goldstar' },
  payment: { currency: 'USD' },
} as unknown as GuestTicket;

describe('DriveHomeSheet', () => {
  it('autocomplete → quote → terms → authorize', async () => {
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    fireEvent.click(await screen.findByText('1 Main St, Indianapolis'));
    await waitFor(() =>
      expect(calls.guestRequestDriveHome).toHaveBeenCalledWith({
        token: 'AbCdEfGhIjKlMnOpQrStUv',
        destination: { address: '1 Main St, Indianapolis', geo: { lat: 39.7, lng: -86.1 }, placeId: 's1' },
      })
    );
    expect(await screen.findByText('$45.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm and authorize' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and authorize' }));
    await waitFor(() =>
      expect(calls.guestConfirmDriveHome).toHaveBeenCalledWith({ token: 'JobTokenJobTokenJobTok', termsVersion: 'drive-home-v1' })
    );
    expect(await screen.findByTestId('pe')).toBeInTheDocument(); // confirm uses the JOB token
  });

  // Added for this task: the quote's breakdown row and distance/duration
  // must also render, not just the total.
  it('renders the quote breakdown, distance, and duration', async () => {
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    fireEvent.click(await screen.findByText('1 Main St, Indianapolis'));
    expect(await screen.findByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('5.0 mi')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });

  // Added for this task: an already-expired quote shows an honest re-request
  // CTA instead of a confirmable terms/Confirm block.
  it('handles an already-expired quote honestly: no confirm, a re-request CTA', async () => {
    calls.guestRequestDriveHome.mockResolvedValueOnce({
      quote: {
        base: 2500,
        distanceMeters: 8046,
        durationSec: 900,
        amount: 4500,
        breakdown: [{ label: 'Base', amount: 2500 }],
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      jobToken: 'JobTokenJobTokenJobTok',
    });
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    fireEvent.click(await screen.findByText('1 Main St, Indianapolis'));
    expect(await screen.findByText(/quote has expired/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /I understand/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm and authorize' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /get a new quote/i }));
    expect(screen.getByLabelText('Destination')).toBeInTheDocument();
  });

  // Added for this task: guestRequestDriveHome rejecting must surface
  // sanitized copy (never PlatformError.message) and leave the guest able
  // to retry from the address step.
  it('shows sanitized error copy when guestRequestDriveHome rejects', async () => {
    calls.guestRequestDriveHome.mockRejectedValueOnce(new PlatformError('rate_limited', 'internal detail, never shown'));
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    fireEvent.click(await screen.findByText('1 Main St, Indianapolis'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a moment and try again.');
    expect(screen.queryByText('internal detail, never shown')).toBeNull();
  });

  // Added for this task: after authorization, the sheet moves to a tracking
  // step subscribed on the JOB token (guestTickets/{jobToken}), not the
  // valet token — proves the parent projection's `linkedJobs` resume path
  // is unnecessary within a single session because this sheet already holds
  // jobToken in memory.
  it('shows the tracking step subscribed on the job token after authorization', async () => {
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    fireEvent.click(await screen.findByText('1 Main St, Indianapolis'));
    await screen.findByText('$45.00');
    fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and authorize' }));
    await screen.findByTestId('pe');

    // StripeForm itself is mocked out (see mocks above), so this test can't
    // click "Pay" through it — it instead simulates the live job ticket
    // flipping to an assigned/en-route status, which is what actually
    // drives the tracking view in production once the guest's confirmPayment
    // resolves and the webhook-driven projection updates.
    act(() =>
      emitJob({
        operatorId: 'goldstar',
        ticketId: 'job1',
        venueName: 'St. Elmo',
        jobType: 'drive_home',
        status: 'en_route_to_guest',
        branding: ticket.branding,
        vehicleSummary: 'Blue Honda Civic',
        times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
        payment: { status: 'authorized', base: 4500, tip: 0, tax: 0, fees: 0, total: 4500, currency: 'USD', tipPresets: [] },
        driver: { firstName: 'Sam', etaAt: '2026-08-23T21:20:00.000Z' },
        features: { driveHome: false, passengerRides: false },
        expiresAt: '2099-01-01T00:00:00.000Z',
        updatedAt: 'x',
      })
    );
    expect(await screen.findByText(/sam/i)).toBeInTheDocument();
  });

  it('closes on Escape and calls onClose', () => {
    const onClose = vi.fn();
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Fix round 1 (Major-3): the real two-layer repro, not just
  // address-autocomplete.test.tsx's isolated version — proves the fix
  // holds inside the actual DialogShell + AddressAutocomplete composition,
  // not just in a component-level assertion.
  it('Major-3: Escape closes only the open destination listbox, not the whole sheet — a second Escape then closes the sheet', async () => {
    const onClose = vi.fn();
    render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '1 Main' } });
    await screen.findByText('1 Main St, Indianapolis');

    // getByRole('combobox') here, not getByLabelText: once the listbox is
    // open it ALSO carries aria-label="Destination" (for its own
    // accessible name as a listbox), so getByLabelText now matches two
    // elements.
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Destination' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Destination' })).toHaveValue('1 Main'); // in-progress input untouched

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // Fix round 1 (Ruling H): resumeToken puts the sheet straight into
  // tracking on the EXISTING job — no address/quote/terms step is ever
  // reachable, and no new request/confirm call is possible.
  describe('resumeToken (Ruling H)', () => {
    it('renders tracking directly on the resumed job token, with no address/quote/terms UI', async () => {
      // These mocks accumulate call history across the whole file (no
      // clearMocks configured) — clear so the `.not.toHaveBeenCalled()`
      // assertions below reflect only this test.
      calls.guestRequestDriveHome.mockClear();
      calls.guestConfirmDriveHome.mockClear();
      render(
        <DriveHomeSheet
          token="AbCdEfGhIjKlMnOpQrStUv"
          ticket={ticket}
          onClose={() => {}}
          resumeToken="ExistingJobTokenExisti"
        />
      );
      expect(screen.getByRole('dialog', { name: 'Drive home status' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Destination')).toBeNull();
      expect(screen.queryByRole('checkbox', { name: /I understand/ })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Confirm and authorize' })).toBeNull();

      act(() =>
        emitJob({
          operatorId: 'goldstar',
          ticketId: 'job1',
          venueName: 'St. Elmo',
          jobType: 'drive_home',
          status: 'assigned',
          branding: ticket.branding,
          vehicleSummary: 'Blue Honda Civic',
          times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
          payment: { status: 'authorized', base: 4500, tip: 0, tax: 0, fees: 0, total: 4500, currency: 'USD', tipPresets: [] },
          driver: { firstName: 'Sam', etaAt: '2026-08-23T21:20:00.000Z' },
          features: { driveHome: false, passengerRides: false },
          expiresAt: '2099-01-01T00:00:00.000Z',
          updatedAt: 'x',
        })
      );
      expect(await screen.findByText(/sam/i)).toBeInTheDocument();

      // No new request/confirm was ever possible in this mode.
      expect(calls.guestRequestDriveHome).not.toHaveBeenCalled();
      expect(calls.guestConfirmDriveHome).not.toHaveBeenCalled();
    });

    it('still closes on Escape while resumed', () => {
      const onClose = vi.fn();
      render(
        <DriveHomeSheet
          token="AbCdEfGhIjKlMnOpQrStUv"
          ticket={ticket}
          onClose={onClose}
          resumeToken="ExistingJobTokenExisti"
        />
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });

  // Addendum round (v0.3.9): a resumed job still at 'quoted' has no driver/ETA yet — resuming into
  // JobTrackingView was misleading. The projection now carries driveHome.quote/destination, so the
  // sheet resumes into the SAME quote/terms/Confirm screen the fresh flow shows, sourced from the
  // LIVE job doc rather than any local request state.
  describe('resume-quote (v0.3.9 addendum)', () => {
    const quotedJob = {
      operatorId: 'goldstar',
      ticketId: 'job1',
      venueName: 'St. Elmo',
      jobType: 'drive_home',
      status: 'quoted',
      branding: ticket.branding,
      vehicleSummary: 'Blue Honda Civic',
      times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
      payment: { status: 'none', base: 4500, tip: 0, tax: 0, fees: 0, total: 4500, currency: 'USD', tipPresets: [] },
      driveHome: {
        quote: { base: 2500, distanceMeters: 8046, durationSec: 900, amount: 4500, breakdown: [{ label: 'Base', amount: 2500 }], expiresAt: '2099-01-01T00:00:00.000Z' },
        destination: { address: '123 Elm St, Indianapolis', geo: { lat: 39.7, lng: -86.1 } },
      },
      features: { driveHome: false, passengerRides: false },
      expiresAt: '2099-01-01T00:00:00.000Z',
      updatedAt: 'x',
    };

    it('reload-at-quoted renders the resumed quote (amount, destination) and a Confirm button — no guestRequestDriveHome call', async () => {
      calls.guestRequestDriveHome.mockClear();
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob(quotedJob));

      expect(await screen.findByText('$45.00')).toBeInTheDocument();
      expect(screen.getByText('123 Elm St, Indianapolis')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /I understand/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm and authorize' })).toBeInTheDocument();
      expect(calls.guestRequestDriveHome).not.toHaveBeenCalled();
    });

    it('confirming a resumed quote calls guestConfirmDriveHome with the RESUME token, then shows the Payment Element', async () => {
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob(quotedJob));
      await screen.findByText('$45.00');

      fireEvent.click(screen.getByRole('checkbox', { name: /I understand/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and authorize' }));
      await waitFor(() =>
        expect(calls.guestConfirmDriveHome).toHaveBeenCalledWith({ token: 'ExistingJobTokenExisti', termsVersion: 'drive-home-v1' })
      );
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
    });

    it('an expired resumed quote falls through to the existing re-request path (Get a new quote reveals the fresh address step)', async () => {
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() =>
        emitJob({
          ...quotedJob,
          driveHome: { ...quotedJob.driveHome, quote: { ...quotedJob.driveHome.quote, expiresAt: new Date(Date.now() - 1000).toISOString() } },
        })
      );

      expect(await screen.findByText(/quote has expired/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm and authorize' })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: /get a new quote/i }));
      expect(screen.getByLabelText('Destination')).toBeInTheDocument();
    });

    // Controller follow-up: verify the resume path reuses QuoteView's own countdown mechanics
    // (useQuoteExpiry, called once with effectiveQuote?.expiresAt — quote-view.tsx) rather than a
    // duplicate — a live tick AND its interval cleanup on unmount, exercised through the full
    // resumed sheet, not just the shared hook in isolation (quote-view.test.tsx already covers
    // that in isolation; this proves the SAME mechanism is actually wired through here).
    it('the resumed quote countdown ticks live and cleans up its interval on unmount — same useQuoteExpiry mechanics as a fresh quote', async () => {
      vi.useFakeTimers();
      try {
        const { unmount } = render(
          <DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />
        );
        act(() =>
          emitJob({
            ...quotedJob,
            driveHome: { ...quotedJob.driveHome, quote: { ...quotedJob.driveHome.quote, expiresAt: new Date(Date.now() + 125_000).toISOString() } },
          })
        );
        expect(screen.getByText('Expires in 2:05')).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(5000);
        });
        expect(screen.getByText('Expires in 2:00')).toBeInTheDocument();

        const clearSpy = vi.spyOn(global, 'clearInterval');
        unmount();
        expect(clearSpy).toHaveBeenCalled();
        clearSpy.mockRestore();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Second addendum round (controller ruling): a job resumed at 'confirmed' — terms already
  // accepted in a prior session, payment not yet completed — resumes STRAIGHT to the payment step
  // by re-calling the idempotent guestConfirmDriveHome automatically, no click required.
  describe('resume-at-confirmed (second addendum round)', () => {
    const confirmedJob = {
      operatorId: 'goldstar',
      ticketId: 'job1',
      venueName: 'St. Elmo',
      jobType: 'drive_home',
      status: 'confirmed',
      branding: ticket.branding,
      vehicleSummary: 'Blue Honda Civic',
      times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
      payment: { status: 'pending', base: 4500, tip: 0, tax: 0, fees: 0, total: 4500, currency: 'USD', tipPresets: [] },
      driveHome: {
        quote: { base: 2500, distanceMeters: 8046, durationSec: 900, amount: 4500, breakdown: [{ label: 'Base', amount: 2500 }] },
        destination: { address: '123 Elm St, Indianapolis', geo: { lat: 39.7, lng: -86.1 } },
        termsAcceptedAt: '2026-08-23T21:05:00.000Z',
      },
      features: { driveHome: false, passengerRides: false },
      expiresAt: '2099-01-01T00:00:00.000Z',
      updatedAt: 'x',
    };

    it('lands on payment automatically, with the quote summary and a "Terms accepted" line, calling guestConfirmDriveHome with the resume jobToken', async () => {
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob(confirmedJob));

      await waitFor(() =>
        expect(calls.guestConfirmDriveHome).toHaveBeenCalledWith({ token: 'ExistingJobTokenExisti', termsVersion: 'drive-home-v1' })
      );
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
      expect(screen.getByText('$45.00')).toBeInTheDocument();
      expect(screen.getByText('123 Elm St, Indianapolis')).toBeInTheDocument();
      expect(screen.getByText('Terms accepted')).toBeInTheDocument();
      // No terms checkbox — already accepted, nothing to re-agree to.
      expect(screen.queryByRole('checkbox', { name: /I understand/ })).toBeNull();
    });

    // Fix round (Major #2, task-45-review.md): a rejected auto-confirm previously fell all the way
    // through to JobTrackingView's "We'll assign a driver shortly." — actively wrong (no driver
    // will ever be assigned without a completed payment) and with no visible retry short of an
    // undiscoverable dismiss+reopen. Now: an explicit error state + "Try again" button.
    it('a rejected auto-confirm surfaces sanitized copy AND a discoverable "Try again" retry button — never the misleading tracking copy', async () => {
      calls.guestConfirmDriveHome.mockRejectedValueOnce(new PlatformError('internal', 'raw detail, never shown'));
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob(confirmedJob));

      expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
      expect(screen.queryByText('raw detail, never shown')).toBeNull();
      expect(screen.getByText(/couldn.t complete your payment/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      // The misleading fallback copy must NOT render for this case.
      expect(screen.queryByText(/assign a driver shortly/i)).toBeNull();
    });

    it('clicking "Try again" re-calls guestConfirmDriveHome with the same jobToken, and success after retry lands on the payment step', async () => {
      calls.guestConfirmDriveHome.mockRejectedValueOnce(new PlatformError('internal', 'raw detail, never shown'));
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob(confirmedJob));
      const retryButton = await screen.findByRole('button', { name: 'Try again' });

      calls.guestConfirmDriveHome.mockClear();
      fireEvent.click(retryButton);
      await waitFor(() =>
        expect(calls.guestConfirmDriveHome).toHaveBeenCalledWith({ token: 'ExistingJobTokenExisti', termsVersion: 'drive-home-v1' })
      );
      expect(await screen.findByTestId('pe')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    });

    it('does NOT auto-confirm (and does not error) when payment already succeeded — falls through to tracking instead, since there is nothing left to pay', async () => {
      calls.guestConfirmDriveHome.mockClear();
      render(<DriveHomeSheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} resumeToken="ExistingJobTokenExisti" />);
      act(() => emitJob({ ...confirmedJob, payment: { ...confirmedJob.payment, status: 'authorized' } }));

      expect(await screen.findByText(/assign a driver shortly/i)).toBeInTheDocument();
      expect(calls.guestConfirmDriveHome).not.toHaveBeenCalled();
    });
  });
});
