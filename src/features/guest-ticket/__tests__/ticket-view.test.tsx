import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformError } from '@goldstar/platform';

// Fix round 1 (Ruling H): subscriptions are now tracked per-token, not just
// the single most-recent one — resuming a linked job opens a SECOND
// `subscribeGuestTicket` call (for the job's own token) alongside the
// parent ticket's. `emit` is kept as-is (always the LATEST subscription)
// so all of this file's existing bare `emit(...)` calls keep working
// unchanged — they only ever run before a second subscription exists.
// `emitToken(token, data)` is the new addition, for tests that need to
// target a SPECIFIC one once two are live at once.
const subs: Record<string, (t: unknown) => void> = {};
let emit: (t: unknown) => void = () => {};
vi.mock('@/lib/public/firebase', () => ({
  subscribeGuestTicket: (t: string, cb: (t: unknown) => void) => {
    subs[t] = cb;
    emit = cb;
    return () => {
      delete subs[t];
    };
  },
  publicFirebase: () => ({}),
}));
function emitToken(token: string, data: unknown) {
  subs[token]?.(data);
}
const request = vi.fn(async () => ({ status: 'requested' }));
const assist = vi.fn(async () => ({ ok: true }));
vi.mock('@/lib/public/callables', () => ({
  guestCall: (n: string) => (n === 'guestRequestVehicle' ? request : assist),
}));

import { TicketView } from '../ticket-view';

// Matches @goldstar/platform v0.3.5's guestTicketSchema field-for-field —
// verified against node_modules/@goldstar/platform/dist/index.d.ts and the
// vendored source (goldstar-platform/src/schemas/guestTicket.ts). No drift
// from the brief's fixture was found; `linkedJobs` is omitted here (it has
// a zod `.default([])`, and this fixture is passed through `emit` as
// `unknown`, not validated against the real schema) the same way the brief
// omitted it — `findActiveLinkedJob` in ticket-view.tsx is guarded with
// `?? []` for exactly this reason (Fix round 1, Ruling H). Individual tests
// in the "Ruling H: linkedJobs resume" describe block below spread `base`
// with an explicit `linkedJobs` array where that field matters.
const base = {
  operatorId: 'goldstar',
  ticketId: 't1',
  venueName: 'St. Elmo',
  jobType: 'valet',
  status: 'checked_in',
  branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' },
  vehicleSummary: 'Blue Honda Civic',
  times: { checkedInAt: '2026-08-23T21:00:00.000Z' },
  payment: { status: 'none', base: 0, tip: 0, tax: 0, fees: 0, total: 0, currency: 'USD', tipPresets: [18, 20, 25] },
  features: { driveHome: true, passengerRides: false },
  expiresAt: '2099-01-01T00:00:00.000Z',
  updatedAt: 'x',
};

describe('TicketView', () => {
  it('shows a ride as "Your ride" with the driver\u2019s car, not as the guest\u2019s vehicle', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() =>
      emit({
        ...base,
        jobType: 'passenger_ride',
        status: 'en_route_to_pickup',
        vehicleSummary: 'Black Lincoln Navigator',
        driver: { firstName: 'Luis', vehicle: 'Black Lincoln Navigator' },
      }),
    );
    expect(await screen.findByRole('region', { name: 'Your ride' })).toBeInTheDocument();
    expect(screen.queryByText(/Checked in at/)).not.toBeInTheDocument();
  });

  it('shows vehicle and Request CTA; requesting calls callable and shows requested state', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    expect(await screen.findByText('Blue Honda Civic')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Request my car' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ token: 'AbCdEfGhIjKlMnOpQrStUv' }));
    act(() => emit({ ...base, status: 'requested', times: { ...base.times, requestedAt: 'x' } }));
    expect(await screen.findByText(/bringing your car/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drive me home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request a ride' })).toBeNull();
  });

  it('ready state banner; assistance toggle; closed view; missing token', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, status: 'ready' }));
    expect(await screen.findByText(/your car is ready/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'I need assistance' }));
    await waitFor(() => expect(assist).toHaveBeenCalledWith({ token: 'AbCdEfGhIjKlMnOpQrStUv', assistance: true }));
    act(() => emit({ ...base, status: 'closed' }));
    expect(await screen.findByText(/thanks for visiting/i)).toBeInTheDocument();
    act(() => emit(null));
    expect(await screen.findByText(/link has expired/i)).toBeInTheDocument();
  });

  // Added for this task: the brief's given tests (above, assertions
  // unchanged) don't cover PaySheet at all — it's a Task 2 addition per the
  // controller's ruling ("Test the ticket-view's pay button opens it").
  // Renamed (Task 3 fix round 1, review nit) — this exercises the REAL
  // `PaySheet` now (Task 3 replaced Task 2's a11y-shell stub), not a stub;
  // it never clicks "Continue to payment," so no Stripe-specific mocking
  // is needed for it to pass.
  it('opens the pay sheet from Pay & tip and closes it', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    await screen.findByText('Blue Honda Civic');
    fireEvent.click(screen.getByRole('button', { name: 'Pay & tip' }));
    expect(await screen.findByRole('dialog', { name: /pay & tip/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  // F6 (final review): a guest can land on the ticket page with
  // `payment.status` still 'pending' — normally a 1-3s webhook window right
  // after paying, but under webhook lag/outage it's the entry point to the
  // platform-side F2 double-charge trace. The button stays enabled (F2's
  // guard makes a re-tap safe), but a "Payment processing…" note tells the
  // guest a payment may already be in flight.
  it('shows a "Payment processing…" note alongside an enabled Pay & tip button when payment.status is pending', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, payment: { ...base.payment, status: 'pending' } }));
    await screen.findByText('Blue Honda Civic');
    const payButton = screen.getByRole('button', { name: 'Pay & tip' });
    expect(payButton).not.toBeDisabled();
    expect(screen.getByText('Payment processing…')).toBeInTheDocument();
  });

  it('does not show the processing note when payment.status is none', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    await screen.findByText('Blue Honda Civic');
    expect(screen.queryByText('Payment processing…')).toBeNull();
  });

  // M3 (final review): the `/t/{token}` page this SMS links to used to show "Pay & tip" on a
  // non-valet job whose card is already authorized (manual capture, charged at trip completion) —
  // tapping it would hit the platform's own payment_already_paid guard. 'authorized' now reads as
  // settled for this block on drive_home/passenger_ride: no button, an honest status line instead.
  it('M3: an authorized non-valet job shows the authorized-pending line, not Pay & tip', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'drive_home', status: 'in_transit', payment: { ...base.payment, status: 'authorized' } }));
    await screen.findByText('Blue Honda Civic');
    expect(screen.getByText('Payment authorized — you’ll be charged when your trip completes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay & tip' })).toBeNull();
    expect(screen.queryByText('Paid · thank you')).toBeNull();
  });

  it('M3: an authorized VALET ticket is unaffected — still shows Pay & tip, not the authorized-pending line', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'valet', payment: { ...base.payment, status: 'authorized' } }));
    await screen.findByText('Blue Honda Civic');
    expect(screen.getByRole('button', { name: 'Pay & tip' })).toBeInTheDocument();
    expect(screen.queryByText(/Payment authorized/)).toBeNull();
  });

  it('M3: a PAID non-valet job is unaffected — still shows "Paid · thank you", not the authorized-pending line', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'drive_home', status: 'completed', payment: { ...base.payment, status: 'paid' } }));
    await screen.findByText('Blue Honda Civic');
    expect(screen.getByText('Paid · thank you')).toBeInTheDocument();
    expect(screen.queryByText(/Payment authorized/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pay & tip' })).toBeNull();
  });

  // Fix round 1 / C1: 'requested' is the initial status for drive_home AND
  // passenger_ride jobs too (see initialStatus() in
  // goldstar-platform/src/state/index.ts), not just valet's. The
  // valet-only "bringing your car around" banner must not leak onto those.
  it('gates the valet banner by jobType and shows job copy for a drive_home ticket at its initial status', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'drive_home', status: 'requested' }));
    expect(await screen.findByText(/arranging your ride home/i)).toBeInTheDocument();
    expect(screen.queryByText(/bringing your car around/i)).toBeNull();
  });

  it('gates the valet banner by jobType and shows job copy for a passenger_ride ticket at its initial status', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'passenger_ride', status: 'requested' }));
    expect(await screen.findByText(/arranging your ride\./i)).toBeInTheDocument();
    expect(screen.queryByText(/bringing your car around/i)).toBeNull();
  });

  // Fix round 2: the reviewer's exact repro — the round-1 non-valet block
  // was gated only on jobType, not status, so it kept showing the
  // "arranging your ride..." in-progress line all the way through
  // 'arrived' and 'completed' too. jobBanner() now maps those two
  // explicitly to their own tail copy instead.
  it('shows arrived tail copy for a drive_home ticket at arrived, not the arranging line', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'drive_home', status: 'arrived' }));
    expect(await screen.findByText(/driver has arrived/i)).toBeInTheDocument();
    expect(screen.queryByText(/arranging your ride/i)).toBeNull();
  });

  it('shows completed tail copy for a drive_home ticket at completed, not the arranging line', async () => {
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit({ ...base, jobType: 'drive_home', status: 'completed' }));
    expect(await screen.findByText(/trip complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/arranging your ride/i)).toBeNull();
  });

  // Fix round 1 / C2: prove the reject paths, not just the happy path —
  // the button/switch must re-enable (not stay stuck in the optimistic/
  // busy state) and errorCopy's mapped text must be shown via role=alert.
  it('re-enables Request my car and shows mapped error copy when guestRequestVehicle rejects', async () => {
    request.mockRejectedValueOnce(new PlatformError('rate_limited', 'internal detail, never shown'));
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    await screen.findByText('Blue Honda Civic');
    fireEvent.click(screen.getByRole('button', { name: 'Request my car' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith({ token: 'AbCdEfGhIjKlMnOpQrStUv' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait a moment and try again.');
    const button = screen.getByRole('button', { name: 'Request my car' });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('shows the generic fallback when guestRequestVehicle rejects with a non-PlatformError', async () => {
    request.mockRejectedValueOnce(new Error('boom'));
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    await screen.findByText('Blue Honda Civic');
    fireEvent.click(screen.getByRole('button', { name: 'Request my car' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
  });

  it('re-enables the assistance switch and shows mapped error copy when guestFlagAssistance rejects', async () => {
    assist.mockRejectedValueOnce(new PlatformError('ticket_closed', 'internal detail, never shown'));
    render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
    act(() => emit(base));
    await screen.findByText('Blue Honda Civic');
    const toggle = screen.getByRole('switch', { name: 'I need assistance' });
    fireEvent.click(toggle);
    await waitFor(() => expect(assist).toHaveBeenCalledWith({ token: 'AbCdEfGhIjKlMnOpQrStUv', assistance: true }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This ticket is closed.');
    expect(toggle).not.toBeDisabled();
  });

  // Added for this task: DriveHomeSheet/RideSheet open from the
  // #drive-home / #ride hash TicketView's own buttons set (Task 2), via
  // `useHashRoute` (Task 4).
  describe('hash-driven request sheets', () => {
    afterEach(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    it('opens DriveHomeSheet when "Drive me home" is clicked and closes it back to a clean hash', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() => emit(base));
      await screen.findByText('Blue Honda Civic');

      fireEvent.click(screen.getByRole('button', { name: 'Drive me home' }));
      expect(await screen.findByRole('dialog', { name: 'Drive me home' })).toBeInTheDocument();
      expect(window.location.hash).toBe('#drive-home');
      expect(screen.getByLabelText('Destination')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(window.location.hash).toBe('');
    });

    it('opens RideSheet when "Request a ride" is clicked', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() => emit({ ...base, features: { driveHome: false, passengerRides: true } }));
      await screen.findByText('Blue Honda Civic');

      fireEvent.click(screen.getByRole('button', { name: 'Request a ride' }));
      expect(await screen.findByRole('dialog', { name: 'Request a ride' })).toBeInTheDocument();
      expect(screen.getByLabelText('Pickup')).toBeInTheDocument();
      expect(screen.getByLabelText('Dropoff')).toBeInTheDocument();
    });

    it('opens the sheet from a hash already present on initial load, without a click', async () => {
      window.location.hash = 'drive-home';
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() => emit(base));
      expect(await screen.findByRole('dialog', { name: 'Drive me home' })).toBeInTheDocument();
    });

    it('does not open a sheet for a feature the venue does not offer, even if the hash is set directly', async () => {
      window.location.hash = 'ride';
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      // `base` fixture has features.passengerRides: false.
      act(() => emit(base));
      await screen.findByText('Blue Honda Civic');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('does not open a sheet for a non-valet job, even if the hash is set directly', async () => {
      window.location.hash = 'drive-home';
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() => emit({ ...base, jobType: 'drive_home', status: 'requested' }));
      await screen.findByText(/arranging your ride home/i);
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // Fix round 1 (Major-1 / Ruling H): `ticket.linkedJobs` (verified against
  // the installed @goldstar/platform@0.3.5 dist to carry each linked job's
  // own `token` alongside its `status`) drives resume-on-reload and blocks
  // a duplicate in-flight request. "Active" = not in the canonical
  // `TERMINAL_STATUSES` export (`['closed', 'cancelled']`).
  describe('Ruling H: linkedJobs resume', () => {
    afterEach(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    it('relabels the button and resumes DriveHomeSheet directly in tracking mode for an active drive_home linkedJobs entry — no duplicate request possible', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [{ jobType: 'drive_home', status: 'assigned', token: 'JobTokenJobTokenJobTok', ticketId: 'job1' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      // No plain "Drive me home" CTA — the resumed label instead.
      expect(screen.queryByRole('button', { name: 'Drive me home' })).toBeNull();
      const button = screen.getByRole('button', { name: 'Drive home requested — view status' });

      fireEvent.click(button);
      expect(await screen.findByRole('dialog', { name: 'Drive home status' })).toBeInTheDocument();
      // The fresh-request UI is never reachable in resume mode.
      expect(screen.queryByLabelText('Destination')).toBeNull();

      // Tracking subscribes the JOB token, not the valet token — proves it
      // by feeding data through the job's own subscription.
      act(() =>
        emitToken('JobTokenJobTokenJobTok', {
          operatorId: 'goldstar',
          ticketId: 'job1',
          venueName: 'St. Elmo',
          jobType: 'drive_home',
          status: 'en_route_to_guest',
          branding: base.branding,
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

    it('relabels the button and resumes RideSheet directly in tracking mode for an active passenger_ride linkedJobs entry', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          features: { driveHome: false, passengerRides: true },
          linkedJobs: [{ jobType: 'passenger_ride', status: 'en_route_to_pickup', token: 'RideJobTokenRideJobTok', ticketId: 'ridejob1' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      expect(screen.queryByRole('button', { name: 'Request a ride' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Ride requested — view status' }));
      expect(await screen.findByRole('dialog', { name: 'Ride status' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Pickup')).toBeNull();
    });

    // Deferred item (c), final review: the platform's own TERMINAL_STATUSES
    // export (['closed', 'cancelled']) doesn't cover 'arrived'/'completed' —
    // for a drive_home/passenger_ride job those mean the trip is already
    // OVER even though staff hasn't closed the job doc yet. Without this,
    // the button stays stuck on "Drive home requested — view status"
    // indefinitely after the trip ends, instead of offering a fresh request.
    it('does not resume, and offers the normal fresh-request flow, for a linkedJobs entry at completed (deferred item c)', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [{ jobType: 'drive_home', status: 'completed', token: 'DoneJobTokenDoneJobTok', ticketId: 'donejob' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      expect(screen.queryByRole('button', { name: 'Drive home requested — view status' })).toBeNull();
      const button = screen.getByRole('button', { name: 'Drive me home' });
      fireEvent.click(button);
      expect(await screen.findByRole('dialog', { name: 'Drive me home' })).toBeInTheDocument();
      expect(screen.getByLabelText('Destination')).toBeInTheDocument();
    });

    it('does not resume, and offers the normal fresh-request flow, for a linkedJobs entry at arrived (deferred item c)', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          features: { driveHome: false, passengerRides: true },
          linkedJobs: [{ jobType: 'passenger_ride', status: 'arrived', token: 'ArrivedJobTokenArrive', ticketId: 'arrivedjob' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      expect(screen.queryByRole('button', { name: 'Ride requested — view status' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Request a ride' })).toBeInTheDocument();
    });

    it('does not resume, and offers the normal fresh-request flow, for a TERMINAL (closed) linkedJobs entry', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [{ jobType: 'drive_home', status: 'closed', token: 'OldClosedJobTokenOldC', ticketId: 'oldjob' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      const button = screen.getByRole('button', { name: 'Drive me home' });
      expect(button).toBeInTheDocument();
      fireEvent.click(button);
      expect(await screen.findByRole('dialog', { name: 'Drive me home' })).toBeInTheDocument();
      expect(screen.getByLabelText('Destination')).toBeInTheDocument();
    });

    // The concrete failure scenario Major-1 described: a guest authorizes a
    // drive-home, the tab reloads, and the guest reopens the page — this is
    // the actual "reload can resume it" case the brief's prose promised.
    it('resumes directly from a hash already present on initial load (the reload scenario) when an active linked job exists', async () => {
      window.location.hash = 'drive-home';
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [{ jobType: 'drive_home', status: 'confirmed', token: 'JobTokenJobTokenJobTok', ticketId: 'job1' }],
        })
      );
      expect(await screen.findByRole('dialog', { name: 'Drive home status' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Destination')).toBeNull();
    });
  });

  // Task 5: the linkedJobs switcher — a passive, read-only tracking view independent of the
  // ghost-button/sheet flow above. No auto-selection (linked-jobs-switcher.tsx's own header
  // comment): nothing subscribes until a tab is clicked.
  describe('Task 5: linkedJobs switcher', () => {
    afterEach(() => {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    it('renders no switcher when linkedJobs is empty/absent', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() => emit(base));
      await screen.findByText('Blue Honda Civic');
      expect(screen.queryByRole('tablist', { name: 'Linked trips' })).toBeNull();
    });

    it('switching to a job token shows tracking, and the ETA banner renders once the projection carries an ETA', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [
            { jobType: 'drive_home', status: 'en_route_to_guest', token: 'JobTokenJobTokenJobTok', ticketId: 'job1' },
          ],
        })
      );
      await screen.findByText('Blue Honda Civic');

      const tab = screen.getByRole('tab', { name: 'Drive home · En Route To Guest' });
      expect(tab).toHaveAttribute('aria-selected', 'false');
      fireEvent.click(tab);
      expect(tab).toHaveAttribute('aria-selected', 'true');

      // Nothing to show yet — the job's own projection hasn't emitted.
      act(() =>
        emitToken('JobTokenJobTokenJobTok', {
          operatorId: 'goldstar',
          ticketId: 'job1',
          venueName: 'St. Elmo',
          jobType: 'drive_home',
          status: 'en_route_to_guest',
          branding: base.branding,
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
      expect(screen.getByRole('status')).toHaveTextContent('Estimated arrival');
    });

    it('lists every linked job, including terminal ones the ghost-button flow no longer surfaces', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [
            { jobType: 'drive_home', status: 'closed', token: 'OldJobTokenOldJobToke', ticketId: 'oldjob' },
          ],
        })
      );
      await screen.findByText('Blue Honda Civic');
      expect(screen.getByRole('tab', { name: 'Drive home · Closed' })).toBeInTheDocument();
    });

    // Addendum round (v0.3.9): a linkedJobs entry at 'quoted' has nothing to track yet — selecting
    // its pill routes to the resume-quote view via the EXISTING sheet machinery (resumeToken),
    // rather than showing JobTrackingView inline for it.
    it('selecting a job at "quoted" opens the resume-quote sheet instead of the inline tracking view', async () => {
      render(<TicketView token="AbCdEfGhIjKlMnOpQrStUv" />);
      act(() =>
        emit({
          ...base,
          linkedJobs: [{ jobType: 'drive_home', status: 'quoted', token: 'JobTokenJobTokenJobTok', ticketId: 'job1' }],
        })
      );
      await screen.findByText('Blue Honda Civic');

      const tab = screen.getByRole('tab', { name: 'Drive home · Quoted' });
      fireEvent.click(tab);

      // Not selected inline — routed to the sheet instead.
      expect(tab).toHaveAttribute('aria-selected', 'false');
      expect(await screen.findByRole('dialog', { name: 'Drive home status' })).toBeInTheDocument();
    });
  });
});
