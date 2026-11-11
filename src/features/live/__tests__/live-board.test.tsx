import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ticket, User, Venue } from '@goldstar/platform';
import type { LiveDriverLocation } from '../use-live-locations';

const update = vi.fn(async (_path: string, _data: unknown) => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, path: string) => ({ path }),
  updateDoc: (ref: { path: string }, data: unknown) => update(ref.path, data),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

// Task 4: TicketDrawer now links to `/tickets/[ticketId]` via useRouter().push, so this page's
// tree needs an app-router context for it — this file otherwise never navigates.
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const staffCancelTicket = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => staffCancelTicket }));

// Reassign reads today's shift assignedUids first, falling back to venue staff — empty shifts
// here so every test exercises the fallback (venue-staff) path deterministically.
vi.mock('@/features/shifts/use-shifts', () => ({ useVenueShifts: () => ({ data: [], loading: false, error: null }) }));

// Every viewer of `(operator)` is already a manager — an owner role is enough for both the
// Mark-staged `canTransition` check and (trivially) every other quick action.
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({ status: 'signed_in', claims: { operatorId: 'goldstar', roles: ['owner'], venueIds: [], claimsVersion: 1 }, isPlatformAdmin: false }),
}));

const TICKET: Ticket = {
  id: 't1',
  operatorId: 'goldstar',
  venueId: 'v1',
  jobType: 'valet',
  status: 'retrieving',
  source: 'staff',
  guest: { phoneLast4: '0000', consentSms: false },
  vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
  flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
  attendants: { claimedBy: 'att1' },
  times: { checkedInAt: '2026-08-23T19:00:00.000Z', requestedAt: '2026-08-23T19:05:00.000Z' },
  damageReportIds: [],
  incidentIds: [],
  guestToken: 'x'.repeat(22),
} as unknown as Ticket;

// Fix round 1 (task-3-review.md): both overridable per-test (`liveTicketsOverride`/
// `liveLocationsOverride`, plain closure variables — same idiom `use-operators.test.tsx` already
// establishes for a `vi.mock` factory that needs different data per test) so the Major-fix and
// map-filtering tests below can render a job (drive_home/ride) ticket, or specific liveLocations,
// in isolation from the other tests' shared valet `TICKET` fixture — avoids ambiguous
// multi-match queries (e.g. two "Cancel" buttons) that a single shared fixture list would cause.
let liveTicketsOverride: Record<string, Ticket[]> | null = null;
vi.mock('../use-live-tickets', () => ({
  useLiveTickets: () => ({ ticketsByVenue: liveTicketsOverride ?? { v1: [TICKET] }, loading: false }),
}));
let liveLocationsOverride: LiveDriverLocation[] | null = null;
vi.mock('../use-live-locations', () => ({ useLiveLocations: () => ({ data: liveLocationsOverride ?? [], loading: false, error: null }) }));

// Stub, not the real `mapbox-gl`-backed component — this file only needs to see WHICH props
// `live-board.tsx` passes through once the token is set, not exercise Mapbox itself (covered by
// the report's own build-output/network-capture verification, not RNTL/jsdom).
vi.mock('../live-map', () => ({
  default: ({ liveLocations }: { liveLocations: LiveDriverLocation[] }) => (
    <div data-testid="live-map-stub">{liveLocations.map((l) => l.id).join(',')}</div>
  ),
}));

import { LiveBoard } from '../live-board';

const VENUE: Venue = {
  id: 'v1',
  operatorId: 'goldstar',
  name: 'St. Elmo',
  type: 'restaurant',
  status: 'active',
  address: { line1: '1 Main St', city: 'Indianapolis', region: 'IN', postalCode: '46204', country: 'US' },
  geo: { lat: 39.76, lng: -86.15 },
  zones: [],
} as unknown as Venue;

const ANA: User = {
  uid: 'att1',
  operatorId: 'goldstar',
  displayName: 'Ana',
  email: 'ana@example.com',
  roles: ['attendant'],
  venueIds: ['v1'],
  status: 'active',
  eligibility: { driveHome: false, passengerRide: false, reasons: [] },
  invitedAt: '2026-01-01T00:00:00.000Z',
} as unknown as User;

// A drive_home job in progress — assigned via `attendants.primaryDriverUid`/`chaseDriverUid`, NOT
// `claimedBy` (the valet-only field `TICKET` above uses). Fix round 1 (Major): this is exactly the
// shape of ticket Reassign must not touch.
const JOB_TICKET: Ticket = {
  id: 't2',
  operatorId: 'goldstar',
  venueId: 'v1',
  jobType: 'drive_home',
  status: 'assigned',
  source: 'staff',
  guest: { phoneLast4: '0000', consentSms: false },
  vehicle: { color: 'Black', make: 'Toyota', model: 'Camry' },
  flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
  attendants: { primaryDriverUid: 'driverA', chaseDriverUid: 'driverB' },
  times: { checkedInAt: '2026-08-23T19:00:00.000Z', requestedAt: '2026-08-23T19:05:00.000Z' },
  damageReportIds: [],
  incidentIds: [],
  guestToken: 'y'.repeat(22),
  driveHome: { destination: { address: '123 Home St', geo: { lat: 39.77, lng: -86.16 } }, chase: { status: 'pending' } },
} as unknown as Ticket;

// A DIFFERENT operator's own venue — used only by the final-wave item 16 test below to simulate an
// operatorId switch (unrelated id/name/geo to `VENUE`, deliberately no relationship to it).
const VENUE2: Venue = {
  id: 'v2',
  operatorId: 'other-op',
  name: 'Broad Ripple Tavern',
  type: 'restaurant',
  status: 'active',
  address: { line1: '2 Main St', city: 'Indianapolis', region: 'IN', postalCode: '46220', country: 'US' },
  geo: { lat: 39.87, lng: -86.14 },
  zones: [],
} as unknown as Venue;

beforeEach(() => {
  update.mockClear();
  staffCancelTicket.mockClear();
  liveTicketsOverride = null;
  liveLocationsOverride = null;
  delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN;
});

describe('LiveBoard', () => {
  it('renders one column per venue, with the venue’s active tickets as rows', () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    // "St. Elmo" appears twice by design: once as the venue-selector checkbox label, once as
    // the column header — both venue.name, not a duplicate-render bug.
    expect(screen.getAllByText('St. Elmo')).toHaveLength(2);
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
  });

  it('bug fix (task-89-report.md): venues arriving AFTER the first render (the real `live/page.tsx` shape — mounted on operatorId alone, venues via an async useCollection listener) still get selected, not stuck at zero forever', () => {
    const { rerender } = render(<LiveBoard operatorId="goldstar" venues={[]} staff={[ANA]} />);
    expect(screen.getByText('No venues yet')).toBeInTheDocument();

    rerender(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    // The venue's own column renders (not just its checkbox-selector label) — proof
    // `selectedVenueIds` actually picked up the newly-arrived venue, not just that the venue LIST
    // rendered.
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();
    expect(screen.queryByText('No venues selected')).not.toBeInTheDocument();
  });

  it('a staff member’s manual deselection survives an unrelated venues-array update (the one-time seed effect does not re-run and stomp it)', () => {
    const { rerender } = render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: 'St. Elmo' }));
    expect(screen.getByText('No venues selected')).toBeInTheDocument();

    // A new (but referentially different) venues array of the SAME venue — e.g. a live Firestore
    // snapshot re-delivering unrelated field changes — must not re-seed the selection back on.
    rerender(<LiveBoard operatorId="goldstar" venues={[{ ...VENUE }]} staff={[ANA]} />);
    expect(screen.getByText('No venues selected')).toBeInTheDocument();
  });

  it('final-wave item 16: switching operatorId (with a fresh venues array for the new operator) explicitly resets and reseeds the venue selection', () => {
    const { rerender } = render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    expect(screen.getByRole('checkbox', { name: 'St. Elmo' })).toBeChecked();
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();

    // A different operator with its OWN, unrelated venue — e.g. a platform_admin's "assume
    // operator" switch. This component has always relied on `OperatorGate` remounting it (a fresh
    // instance, fresh refs) whenever that happens; this simulates what would happen if it ever
    // DIDN'T remount, proving the fix is explicit rather than borrowed from that incidental
    // upstream behavior.
    rerender(<LiveBoard operatorId="other-op" venues={[VENUE2]} staff={[]} />);

    // The new operator's venue is selected and its own column actually renders...
    expect(screen.getByRole('checkbox', { name: 'Broad Ripple Tavern' })).toBeChecked();
    expect(screen.getAllByText('Broad Ripple Tavern').length).toBeGreaterThan(0); // checkbox label + column header
    // ...never stuck on the stale "no venues selected" empty state (which the OLD, unfixed code
    // hits: `selectedVenueIds` would still hold the previous operator's venue id, which
    // `venueById` — built from the NEW `venues` prop — can no longer resolve, so no column and no
    // "No venues selected" empty state either, since `selectedVenueIds.length` is non-zero — a
    // silently blank board).
    expect(screen.queryByText('No venues selected')).not.toBeInTheDocument();
    // The OLD operator's venue is gone entirely — not lingering as a phantom checked-but-dead
    // selection.
    expect(screen.queryByText('St. Elmo')).not.toBeInTheDocument();
  });

  it('shows an honest "map unavailable" state when NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN is unset, without loading mapbox-gl', () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    expect(screen.getByText('Map unavailable')).toBeInTheDocument();
  });

  it('Reassign calls updateDoc with attendants.claimedBy, not a full attendants replacement', async () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));

    fireEvent.change(await screen.findByLabelText('Assign to'), { target: { value: 'att1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm reassign' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('operators/goldstar/tickets/t1', { 'attendants.claimedBy': 'att1' }));
  });

  it('Cancel opens a reason dialog whose submit calls the staffCancelTicket callable', async () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const reasonField = await screen.findByLabelText('Cancellation reason');
    expect(staffCancelTicket).not.toHaveBeenCalled(); // opening the dialog alone must not submit anything
    fireEvent.change(reasonField, { target: { value: 'Guest left without the car' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ticket' }));

    await waitFor(() => expect(staffCancelTicket).toHaveBeenCalledWith({ ticketId: 't1', reason: 'Guest left without the car' }));
  });

  it('the Cancel dialog submit button stays disabled for a blank reason', async () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await screen.findByLabelText('Cancellation reason');
    expect(screen.getByRole('button', { name: 'Cancel ticket' })).toBeDisabled();
  });

  it('Mark staged (retrieving -> staged) writes exactly status and times.stagedAt', async () => {
    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark staged' }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [path, data] = update.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar/tickets/t1');
    expect(Object.keys(data).sort()).toEqual(['status', 'times.stagedAt']);
    expect(data.status).toBe('staged');
    expect(typeof data['times.stagedAt']).toBe('string');
  });

  describe('Reassign is valet-only (Fix round 1, Major)', () => {
    it('a drive_home/ride ticket shows an honest note instead of a Reassign button', () => {
      liveTicketsOverride = { v1: [JOB_TICKET] };
      render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
      expect(screen.queryByRole('button', { name: 'Reassign' })).not.toBeInTheDocument();
      expect(screen.getByText('Driver assignments are managed from Dispatch.')).toBeInTheDocument();
      // Cancel is unaffected — 'assigned' isn't a terminal status, so it's still cancellable.
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('a valet ticket is unchanged — Reassign still renders, with no "managed from Dispatch" note', () => {
      liveTicketsOverride = { v1: [TICKET] };
      render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
      expect(screen.getByRole('button', { name: 'Reassign' })).toBeInTheDocument();
      expect(screen.queryByText('Driver assignments are managed from Dispatch.')).not.toBeInTheDocument();
    });
  });

  it('map markers are filtered to tickets the board is actually tracking (Fix round 1, Minor: no dead marker for a deselected/untracked venue)', async () => {
    process.env.NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN = 'test-token';
    liveLocationsOverride = [
      { id: 'driverA', ticketId: 't1', geo: { lat: 39.76, lng: -86.15 }, heading: 90, speed: 0, at: '2026-08-23T19:00:00.000Z', expiresAt: '2026-08-23T20:00:00.000Z' },
      // ticketId 'untracked' isn't in `TICKET`/`ticketsByVenue` — simulates a driver whose ticket
      // belongs to a deselected venue (or a status this board doesn't subscribe to).
      { id: 'driverX', ticketId: 'untracked', geo: { lat: 39.76, lng: -86.15 }, heading: 90, speed: 0, at: '2026-08-23T19:00:00.000Z', expiresAt: '2026-08-23T20:00:00.000Z' },
    ] as unknown as LiveDriverLocation[];

    render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);

    const stub = await screen.findByTestId('live-map-stub');
    expect(stub.textContent).toBe('driverA'); // driverX (untracked ticket) is filtered out
  });

  describe('jobs on the board (owner-demo capture: completed jobs read as 86m late)', () => {
    const COMPLETED_JOB = { ...JOB_TICKET, id: 't3', status: 'completed', vehicle: { color: 'Red', make: 'Audi', model: 'Q5' } } as unknown as Ticket;
    const RIDE_NO_CAR = {
      ...JOB_TICKET,
      id: 't4',
      jobType: 'passenger_ride',
      status: 'quoted',
      vehicle: {},
      driveHome: undefined,
      ride: { pickup: { geo: { lat: 39.77, lng: -86.16 } }, dropoff: { address: '9 Elm St', geo: { lat: 39.78, lng: -86.15 } }, passengers: 1, accessible: false },
    } as unknown as Ticket;

    it('shows the wait timer on valet tickets only, never on drive-home or ride jobs', () => {
      liveTicketsOverride = { v1: [TICKET, JOB_TICKET] };
      render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
      expect(screen.getAllByTestId('sla-timer')).toHaveLength(1);
    });

    it('lists a completed job last, marked done, and leaves it out of the active count', () => {
      liveTicketsOverride = { v1: [COMPLETED_JOB, TICKET] };
      render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
      const rows = screen.getAllByRole('button', { name: /^Open / });
      expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(['Open Blue Honda Civic', 'Open Red Audi Q5']);
      expect(screen.getByText('Done · closes automatically')).toBeInTheDocument();
      expect(screen.getByLabelText(`${VENUE.name}: 1 active`)).toHaveTextContent('1');
    });

    it('titles a ride by what it is, not "Vehicle", before a car is assigned', () => {
      liveTicketsOverride = { v1: [RIDE_NO_CAR] };
      render(<LiveBoard operatorId="goldstar" venues={[VENUE]} staff={[ANA]} />);
      expect(screen.getByRole('button', { name: 'Open Ride' })).toBeInTheDocument();
      expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
    });
  });
});
