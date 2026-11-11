'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { cssVariables, operatorTheme } from '@goldstar/platform/tokens';
import { PlatformError, TERMINAL_STATUSES, type GuestTicket } from '@goldstar/platform';
import { guestCall } from '@/lib/public/callables';
import { errorCopy } from '@/lib/public/error-copy';
import { PAID_STATUSES } from '@/lib/public/payment-status';
import { Button } from '@/components/ui/buttons';
import { Heading, Text } from '@/components/ui/typography';
import { PaySheet } from '@/features/guest-pay/pay-sheet';
import { DriveHomeSheet } from '@/features/guest-requests/drive-home-sheet';
import { RideSheet } from '@/features/guest-requests/ride-sheet';
import { useGuestTicket } from './use-guest-ticket';
import { useHashRoute } from './use-hash-route';
import { BrandHeader } from './brand-header';
import { VehicleCard, formatTime } from './vehicle-card';
import { StatusTimeline } from './status-timeline';
import { ClosedView, ReceiptSummary } from './closed-view';
import { LinkedJobsSwitcher } from './linked-jobs-switcher';
import { JobTrackingView } from './job-tracking-view';

// Valet-only: 'claimed'/'retrieving'/'staged' don't exist in DriveHomeStatus/
// RideStatus, but 'requested' does (it's their initial status too) — this
// set must stay gated by `ticket.jobType === 'valet'` below, not used bare.
const REQUESTABLE_STATUSES = new Set(['requested', 'claimed', 'retrieving', 'staged']);

// drive_home/passenger_ride "in progress" (pre-arrival) statuses — every
// DRIVE_HOME_STATUSES/RIDE_STATUSES member (goldstar-platform's
// domain/status.ts) EXCEPT 'closed'/'cancelled' (already filtered by the
// early return above) and 'arrived'/'completed' (their own tail copy in
// `jobBanner` below). Explicit membership per jobType, no catch-all.
const DRIVE_HOME_IN_PROGRESS = new Set([
  'requested',
  'quoted',
  'confirmed',
  'assigned',
  'en_route_to_guest',
  'pre_drive_inspection',
  'in_transit',
]);
const RIDE_IN_PROGRESS = new Set([
  'requested',
  'quoted',
  'confirmed',
  'assigned',
  'en_route_to_pickup',
  'arrived_pickup',
  'in_transit',
]);

/**
 * Ruling H (Fix round 1): finds an active — i.e. non-terminal, per the
 * canonical `TERMINAL_STATUSES` export (`['closed', 'cancelled']`) —
 * `linkedJobs` entry of the given job type on the PARENT valet ticket's own
 * projection. `GuestTicket.linkedJobs` (verified against the installed
 * `@goldstar/platform@0.3.5` dist) carries each linked job's own `token`
 * alongside its `status`, which is exactly what a "Drive me home"/"Request
 * a ride" button needs to check before offering a fresh request: if the
 * guest already has one in flight (survives a reload, since this reads the
 * LIVE parent ticket doc, not sheet-local state), opening the sheet must
 * resume tracking that job rather than let the guest start a second one
 * (and a second card authorization) alongside it.
 *
 * `ticket.linkedJobs` defaults to `[]` in the zod schema, but
 * `subscribeGuestTicket` (firebase.ts) casts the raw Firestore snapshot
 * straight to `GuestTicket` with `s.data() as GuestTicket` — no parsing, so
 * that schema default never actually applies client-side. Guarded with
 * `?? []` so a ticket doc that predates this field (or any gap in what a
 * future Function writes) degrades to "no active job" instead of throwing.
 *
 * Deferred item (c), final review: the platform's own `TERMINAL_STATUSES`
 * export is `['closed', 'cancelled']` only — it doesn't cover 'arrived'/
 * 'completed', which for a drive_home/passenger_ride job mean the trip is
 * OVER even though the job doc itself isn't closed/cancelled yet (staff
 * closes it later). Without this, a guest whose ride already dropped them
 * off would see the button stuck on "Ride requested — view status"
 * indefinitely instead of a fresh "Request a ride" entry point. Fixed
 * together with F3's server-side `linkedJobs` population (ledgered as a
 * Plan 5 carry) since both land in the same place.
 */
const DONE_LINKED_JOB_STATUSES = new Set([...TERMINAL_STATUSES, 'arrived', 'completed']);

function findActiveLinkedJob(ticket: GuestTicket, jobType: 'drive_home' | 'passenger_ride') {
  return (ticket.linkedJobs ?? []).find((job) => job.jobType === jobType && !DONE_LINKED_JOB_STATUSES.has(job.status));
}

interface JobBanner {
  /** 'progress' renders like the valet "bringing your car around" banner; 'tail' renders like valet's "ready" banner. */
  kind: 'progress' | 'tail';
  heading: string;
  body: string;
}

/**
 * Explicit status -> copy mapping for drive_home/passenger_ride tickets
 * (never called for jobType 'valet'). Every status that can reach this
 * component for those two job types is covered by exactly one branch
 * below — 'arrived'/'completed' get their own tail copy, everything else
 * non-terminal falls into the *_IN_PROGRESS sets. There is no default/
 * catch-all branch: a status this mapping doesn't recognize (e.g. a
 * future addition to the contracts package) returns `null`, and the page
 * renders StatusTimeline only rather than stale or invented copy.
 */
function jobBanner(ticket: GuestTicket): JobBanner | null {
  if (ticket.status === 'arrived') {
    return {
      kind: 'tail',
      heading: 'Your driver has arrived.',
      body: ticket.jobType === 'drive_home' ? "You're home safe." : "You've reached your destination.",
    };
  }
  if (ticket.status === 'completed') {
    return { kind: 'tail', heading: 'Trip complete.', body: 'Thanks for riding with us.' };
  }
  const inProgress = ticket.jobType === 'drive_home' ? DRIVE_HOME_IN_PROGRESS : RIDE_IN_PROGRESS;
  if (!inProgress.has(ticket.status)) return null;
  return {
    kind: 'progress',
    heading: ticket.jobType === 'drive_home' ? "We're arranging your ride home." : "We're arranging your ride.",
    body: ticket.driver
      ? `${ticket.driver.firstName} is on the way${
          ticket.driver.etaAt ? ` — ETA ${formatTime(ticket.driver.etaAt) ?? 'shortly'}` : '.'
        }`
      : "We'll update this page as soon as a driver is assigned.",
  };
}

export function TicketView({ token }: { token: string }) {
  const { ticket, state } = useGuestTicket(token);
  const { route: requestRoute, close: closeRequestSheet } = useHashRoute();
  const [requesting, setRequesting] = useState(false);
  const [assisting, setAssisting] = useState(false);
  const [pay, setPay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Task 5: linkedJobs switcher — see linked-jobs-switcher.tsx's header comment for why there's no
  // auto-selected default. `useGuestTicket` accepts `token: string | null` and simply doesn't
  // subscribe while it's null (same contract DriveHomeSheet/RideSheet already rely on for their own
  // jobToken state), so this hook call is always safe to make unconditionally here even before
  // `ticket` itself has loaded.
  const [selectedJobToken, setSelectedJobToken] = useState<string | null>(null);
  const { ticket: selectedJobTicket, state: selectedJobState } = useGuestTicket(selectedJobToken);

  const vars = useMemo(
    () =>
      ticket
        ? cssVariables(operatorTheme({ primaryColor: ticket.branding.primaryColor, accentColor: ticket.branding.accentColor }))
        : {},
    [ticket]
  );

  const handleError = (e: unknown) => setErr(e instanceof PlatformError ? errorCopy(e.code) : errorCopy('internal'));

  if (state === 'loading') {
    return (
      <main className="p-6" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded bg-bg-tertiary" />
      </main>
    );
  }

  if (state === 'missing' || state === 'expired' || state === 'error' || !ticket) {
    return <ClosedView kind="expired" />;
  }

  if (ticket.status === 'closed' || ticket.status === 'cancelled') {
    return <ClosedView kind={ticket.status} ticket={ticket} />;
  }

  const paid = PAID_STATUSES.has(ticket.payment.status);
  /**
   * M3 (final review): on a non-valet job (drive_home/passenger_ride) `'authorized'` means the
   * guest's card is on file and will be charged when the trip completes (manual capture) — it is
   * NOT unpaid the way a fresh valet ticket is. This `/t/{token}` page is exactly the link the
   * `driveHomeAssigned`/`rideAssigned` SMS sends the guest, so showing "Pay & tip" here let them
   * tap it, open `PaySheet`, and hit the platform's own `payment_already_paid` guard on a job
   * they'd already paid for. Deliberately NOT folded into `PAID_STATUSES` — that set also gates
   * the receipt / "Paid · thank you" copy, which must stay reserved for an ACTUAL capture; an
   * authorized-but-uncaptured job hasn't been charged yet.
   */
  const authorizedPending = ticket.jobType !== 'valet' && ticket.payment.status === 'authorized';
  const nonValetBanner = ticket.jobType !== 'valet' ? jobBanner(ticket) : null;
  const activeDriveHomeJob = findActiveLinkedJob(ticket, 'drive_home');
  const activeRideJob = findActiveLinkedJob(ticket, 'passenger_ride');

  /**
   * Addendum round (v0.3.9): a `linkedJobs` entry at `'quoted'` has nothing to "track" yet — no
   * driver, no ETA — the guest still needs to accept terms and confirm. Per the controller ruling,
   * selecting such a pill in the switcher ROUTES to the resume-quote view via the EXISTING sheet
   * machinery (`DriveHomeSheet`/`RideSheet`'s own `resumeToken` handling, addended above) rather
   * than showing `JobTrackingView` inline for it. Simply opens the same hash route the ghost
   * buttons use — `activeDriveHomeJob`/`activeRideJob` (computed just above via
   * `findActiveLinkedJob`, which already excludes terminal statuses) is GUARANTEED to be this same
   * job: 'quoted' is non-terminal, and an operator only ever has one active job per jobType, so the
   * clicked entry's token and `activeDriveHomeJob`/`activeRideJob`'s token are the same job — no
   * new token plumbing needed into the sheets. Any other status still renders `JobTrackingView`
   * inline via `selectedJobToken`, unchanged.
   */
  const selectLinkedJob = (jobToken: string) => {
    const job = (ticket.linkedJobs ?? []).find((j) => j.token === jobToken);
    if (job?.status === 'quoted' && ticket.jobType === 'valet') {
      window.location.hash = job.jobType === 'drive_home' ? 'drive-home' : 'ride';
      return;
    }
    setSelectedJobToken(jobToken);
  };

  const requestVehicle = async () => {
    setRequesting(true);
    setErr(null);
    try {
      await guestCall('guestRequestVehicle')({ token });
      // Stays `requesting` (spinner + "Requested" label) until the live
      // snapshot confirms the status change — this block unmounts once
      // ticket.status leaves 'checked_in', so there's nothing to reset here.
    } catch (e) {
      setRequesting(false);
      handleError(e);
    }
  };

  const toggleAssistance = async (assistance: boolean) => {
    setAssisting(true);
    setErr(null);
    try {
      await guestCall('guestFlagAssistance')({ token, assistance });
    } catch (e) {
      handleError(e);
    } finally {
      setAssisting(false);
    }
  };

  return (
    <main style={vars as CSSProperties} className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-5">
      <BrandHeader branding={ticket.branding} venueName={ticket.venueName} />
      <VehicleCard
        jobType={ticket.jobType}
        status={ticket.status}
        summary={ticket.vehicleSummary}
        checkedInAt={ticket.times.checkedInAt}
        driver={ticket.driver}
      />

      <div aria-live="polite" className="flex flex-col gap-5">
        <StatusTimeline jobType={ticket.jobType} status={ticket.status} />

        {ticket.status === 'checked_in' ? (
          <Button size="xl" fullWidth loading={requesting} onClick={requestVehicle}>
            {requesting ? 'Requested' : 'Request my car'}
          </Button>
        ) : null}

        {ticket.jobType === 'valet' && REQUESTABLE_STATUSES.has(ticket.status) ? (
          <div className="rounded-2xl bg-primary-50 p-4">
            <Text weight="medium">We&rsquo;re bringing your car around.</Text>
            <Text size="sm" color="secondary">
              {ticket.driver?.etaAt
                ? `ETA ${formatTime(ticket.driver.etaAt) ?? 'shortly'}`
                : "We'll text you when it's at the curb."}
            </Text>
          </div>
        ) : null}

        {/*
          drive_home/passenger_ride tickets never hit `checked_in` or the
          valet-only block above — 'requested' is their *initial* status
          (see initialStatus() in goldstar-platform/src/state/index.ts).
          `jobBanner()` above is the explicit, status-scoped mapping for
          their whole lifecycle (in-progress vs. arrived/completed) — see
          its own comment for why there's no catch-all case.
        */}
        {nonValetBanner ? (
          nonValetBanner.kind === 'progress' ? (
            <div className="rounded-2xl bg-primary-50 p-4">
              <Text weight="medium">{nonValetBanner.heading}</Text>
              <Text size="sm" color="secondary">
                {nonValetBanner.body}
              </Text>
            </div>
          ) : (
            <div className="rounded-2xl bg-accent-100 p-5">
              <Heading level={2} variant="heading-sm">
                {nonValetBanner.heading}
              </Heading>
              <Text>{nonValetBanner.body}</Text>
            </div>
          )
        ) : null}

        {ticket.status === 'ready' ? (
          <div className="rounded-2xl bg-accent-100 p-5">
            <Heading level={2} variant="heading-sm">
              Your car is ready
            </Heading>
            <Text>Meet us at the {ticket.venueName} valet stand.</Text>
          </div>
        ) : null}

        {ticket.status === 'delivered' && paid ? <ReceiptSummary payment={ticket.payment} /> : null}
      </div>

      {authorizedPending ? (
        <Text color="secondary" weight="medium" role="status">
          Payment authorized — you&rsquo;ll be charged when your trip completes.
        </Text>
      ) : !paid ? (
        <>
          <Button size="lg" variant="secondary" fullWidth onClick={() => setPay(true)}>
            Pay & tip
          </Button>
          {/*
            F6 (final review): a guest can land on `/t/{token}` with
            `payment.status` still `'pending'` — normally a 1-3s webhook
            window right after paying, but under webhook lag/outage it's the
            entry point to F2's double-charge trace. The button stays
            enabled (the F2 platform guard makes a re-tap safe: it now
            surfaces `payment_already_paid` instead of minting a second
            intent), but this note tells the guest a payment may already be
            in flight before they tap it again.
          */}
          {ticket.payment.status === 'pending' ? (
            <Text size="sm" color="secondary" role="status">
              Payment processing…
            </Text>
          ) : null}
        </>
      ) : (
        <Text color="success" weight="medium">
          Paid · thank you
        </Text>
      )}

      <label className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-white p-4">
        <Text>I need assistance</Text>
        <input
          role="switch"
          aria-label="I need assistance"
          type="checkbox"
          disabled={assisting}
          className="h-6 w-11"
          onChange={(e) => toggleAssistance(e.target.checked)}
        />
      </label>

      {ticket.features.driveHome && ticket.jobType === 'valet' ? (
        <Button variant="ghost" fullWidth onClick={() => (window.location.hash = 'drive-home')}>
          {activeDriveHomeJob ? 'Drive home requested — view status' : 'Drive me home'}
        </Button>
      ) : null}
      {ticket.features.passengerRides && ticket.jobType === 'valet' ? (
        <Button variant="ghost" fullWidth onClick={() => (window.location.hash = 'ride')}>
          {activeRideJob ? 'Ride requested — view status' : 'Request a ride'}
        </Button>
      ) : null}

      {/*
        Task 5: linkedJobs switcher — a passive, read-only way to view tracking for ANY job linked
        to this ticket (active or past), independent of the "Drive me home"/"Request a ride"
        buttons above (which start a NEW request, or reopen the sheet for the one CURRENTLY active
        job via Ruling H's resumeToken path). `ticket.linkedJobs` defaults to `[]` server-side but
        (like `findActiveLinkedJob` above) is guarded here too, for the same reason: a fixture/doc
        that predates this field degrades to "no switcher" rather than throwing.
      */}
      {(ticket.linkedJobs ?? []).length > 0 ? (
        <div className="flex flex-col gap-4">
          <LinkedJobsSwitcher jobs={ticket.linkedJobs ?? []} selectedToken={selectedJobToken} onSelect={selectLinkedJob} />
          {selectedJobToken ? <JobTrackingView ticket={selectedJobTicket} state={selectedJobState} /> : null}
        </div>
      ) : null}

      {err ? (
        <Text color="error" role="alert">
          {err}
        </Text>
      ) : null}

      {ticket.branding.supportPhone ? (
        <a
          className="min-h-11 text-center text-ui-sm text-text-tertiary underline"
          href={`tel:${ticket.branding.supportPhone}`}
        >
          Call the valet stand
        </a>
      ) : null}

      {pay ? <PaySheet token={token} ticket={ticket} onClose={() => setPay(false)} /> : null}

      {/*
        Opened from the #drive-home / #ride hash the buttons above set —
        `useHashRoute` handles hashchange + the initial page load (a guest
        who reloads or shares a link with the hash already present) and
        `close()` clears the hash via history.replaceState (no new history
        entry). Still gated by `features`/`jobType` here, not just at the
        button: a guest could reach `#drive-home` directly (e.g. a stale
        bookmark) for a venue/ticket that doesn't actually offer it.

        Ruling H (Fix round 1): `resumeToken` is passed whenever
        `activeDriveHomeJob`/`activeRideJob` found a non-terminal linkedJobs
        entry above — the sheet then opens straight into tracking on that
        job's own token, with no way to start a second request. `undefined`
        (no active job) falls through to the sheet's normal fresh-request
        flow.
      */}
      {requestRoute === 'drive-home' && ticket.features.driveHome && ticket.jobType === 'valet' ? (
        <DriveHomeSheet
          token={token}
          ticket={ticket}
          onClose={closeRequestSheet}
          resumeToken={activeDriveHomeJob?.token}
        />
      ) : null}
      {requestRoute === 'ride' && ticket.features.passengerRides && ticket.jobType === 'valet' ? (
        <RideSheet token={token} ticket={ticket} onClose={closeRequestSheet} resumeToken={activeRideJob?.token} />
      ) : null}
    </main>
  );
}
