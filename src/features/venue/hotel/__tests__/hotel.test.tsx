import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlatformError, type Ticket, type Venue } from '@goldstar/platform';
import type { Session } from '@/features/auth/session-provider';
import { VenueProvider } from '../../venue-context';
import { HotelView } from '../hotel-view';
import { overnightTickets, stayLength, OVERNIGHT_HOURS } from '../overnight-report';

const { requestMock, toastMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// Contract-checked: the REAL pmsLookup / pmsPostRoomCharge schemas parse what these dialogs build
// before the mock sees them, and the mock's resolved fixtures are parsed against the real output
// schemas on the way back.
vi.mock('@/lib/firebase/callables', async () => {
  const { contractCheckedCallable } = await import('../../__tests__/contract-checked-callable');
  return { callable: contractCheckedCallable(requestMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

let mockTickets: Ticket[] = [];
vi.mock('../../use-venue-tickets', () => ({
  useVenueTickets: () => ({ tickets: mockTickets, loading: false, error: false, retry: vi.fn() }),
}));

const mockSession: Partial<Session> = { claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 } };
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

const HOTEL = { id: 'v1', name: 'The Grand', operatorId: 'op1', type: 'hotel', pms: { provider: 'opera_cloud', hotelId: 'h1', noPostBehavior: 'block', chargeCode: 'VLT' } } as unknown as Venue;
const FALLBACK_HOTEL = { ...HOTEL, pms: { ...(HOTEL as unknown as { pms: object }).pms, noPostBehavior: 'fallback_card' } } as unknown as Venue;
const RESTAURANT = { id: 'v1', name: 'The Grill', operatorId: 'op1', type: 'restaurant' } as unknown as Venue;

const TICKET_ID = '01912345-7abc-7def-8123-456789abcdef';
const HOUR = 3600_000;

function ticket(id: string, hoursAgo: number, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    operatorId: 'op1',
    venueId: 'v1',
    jobType: 'valet',
    status: 'checked_in',
    vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
    guest: { phoneLast4: '0142', consentSms: true },
    times: { checkedInAt: new Date(Date.now() - hoursAgo * HOUR).toISOString() },
    ...over,
  } as unknown as Ticket;
}

const RESERVATION = { reservationRef: 'RES123', guestName: 'Ana Rivera', room: '501', noPost: false };
const NO_POST_RESERVATION = { ...RESERVATION, noPost: true };

/**
 * The failure shape this client ACTUALLY receives. The platform's `toHttpsError` builds every
 * callable failure as `new HttpsError(MAP[code], e.code, …)`, so the message on the wire is the
 * CODE — the handler's `'no_post'` / `'operator suspended'` / `'pms not configured for this venue'`
 * never crosses it, and `@/lib/firebase/callables` rebuilds a `PlatformError` from what arrives.
 * Every `failed_precondition` from this callable is therefore byte-identical here; using the real
 * shape in the fixtures is what keeps these tests from proving something production cannot do.
 */
const WIRE_FAILED_PRECONDITION = () => new PlatformError('failed_precondition', 'failed_precondition');

function renderHotel(venue: Venue = HOTEL) {
  return render(
    <VenueProvider venues={[venue]}>
      <HotelView />
    </VenueProvider>
  );
}

/** Drives lookup -> select, landing in the charge dialog. */
async function findAndSelect(reservation: typeof RESERVATION = RESERVATION) {
  requestMock.mockImplementationOnce(() => ({ reservations: [reservation] }));
  fireEvent.click(screen.getByRole('button', { name: 'Find a reservation' }));
  fireEvent.change(screen.getByLabelText(/Room/), { target: { value: '501' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Charge room' }));
  await screen.findByRole('heading', { name: 'Charge to room' });
}

beforeEach(() => {
  mockTickets = [ticket(TICKET_ID, 14)];
  requestMock.mockReset().mockImplementation(() => ({ postingRef: 'post-1' }));
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
});

describe('overnightTickets / stayLength', () => {
  const NOW = Date.parse('2026-08-30T20:00:00.000Z');
  const at = (hoursAgo: number) => ticket(`t${hoursAgo}`, 0, { times: { checkedInAt: new Date(NOW - hoursAgo * HOUR).toISOString() } } as Partial<Ticket>);

  it(`includes a car older than ${OVERNIGHT_HOURS}h and excludes one younger`, () => {
    const rows = overnightTickets([at(13), at(11)], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('t13');
  });

  it('excludes a car exactly at the boundary — "longer than", not "at least"', () => {
    expect(overnightTickets([at(OVERNIGHT_HOURS)], NOW)).toHaveLength(0);
  });

  it('sorts oldest first, so the longest stay leads', () => {
    expect(overnightTickets([at(15), at(40), at(20)], NOW).map((t) => t.id)).toEqual(['t40', 't20', 't15']);
  });

  it('ignores a ticket with an unparseable check-in rather than sorting it to the top', () => {
    const broken = ticket('broken', 0, { times: { checkedInAt: 'not-a-date' } } as Partial<Ticket>);
    expect(overnightTickets([broken, at(13)], NOW).map((t) => t.id)).toEqual(['t13']);
  });

  it('formats stay length in hours, then days and hours', () => {
    expect(stayLength(new Date(NOW - 14 * HOUR).toISOString(), NOW)).toBe('14h');
    expect(stayLength(new Date(NOW - 27 * HOUR).toISOString(), NOW)).toBe('1d 3h');
    expect(stayLength(new Date(NOW + HOUR).toISOString(), NOW)).toBe('0h'); // never negative
  });
});

describe('HotelView', () => {
  it('renders the overnight report with no PMS involved at all', () => {
    renderHotel();
    expect(screen.getByText('Overnight')).toBeInTheDocument();
    // 14h old — over the threshold — and NO callable was needed to produce this screen.
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('says so honestly when the venue has no PMS, rather than offering a dead search', () => {
    renderHotel(RESTAURANT);
    expect(screen.getByText('No hotel system connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find a reservation' })).not.toBeInTheDocument();
  });

  it('looks a reservation up by room, scoped to the claim-derived venue', async () => {
    requestMock.mockImplementationOnce(() => ({ reservations: [RESERVATION] }));
    renderHotel();
    fireEvent.click(screen.getByRole('button', { name: 'Find a reservation' }));
    fireEvent.change(screen.getByLabelText(/Room/), { target: { value: '501' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', room: '501' }));
    expect(await screen.findByText('Ana Rivera')).toBeInTheDocument();
  });

  it('refuses an empty search rather than asking the PMS for everything', () => {
    renderHotel();
    fireEvent.click(screen.getByRole('button', { name: 'Find a reservation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    // Both `name` and `room` are optional on the contract, so an empty search is contractually
    // valid — this guard is the client's, not the server's.
    expect(screen.getByText('Enter a guest name or a room number.')).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('flags a no-post reservation in the results, before the host picks it', async () => {
    requestMock.mockImplementationOnce(() => ({ reservations: [{ ...RESERVATION, noPost: true }] }));
    renderHotel();
    fireEvent.click(screen.getByRole('button', { name: 'Find a reservation' }));
    fireEvent.change(screen.getByLabelText(/Room/), { target: { value: '501' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('No post')).toBeInTheDocument();
  });

  it('reports no match as information, not an error', async () => {
    requestMock.mockImplementationOnce(() => ({ reservations: [] }));
    renderHotel();
    fireEvent.click(screen.getByRole('button', { name: 'Find a reservation' }));
    fireEvent.change(screen.getByLabelText(/Room/), { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByText('No matching reservation')).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('charges the room with the contract payload — and NO amount', async () => {
    renderHotel();
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenLastCalledWith({ ticketId: TICKET_ID, reservationRef: 'RES123', room: '501' })
    );
    const payload = requestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    // The server prices the ticket and posts what it computes; this client never names a figure.
    expect(payload).not.toHaveProperty('amount');
    expect(toastMock.success).toHaveBeenCalledWith('Charged to room 501');
  });

  it('NO LINK STEP: selecting a reservation writes nothing — only the lookup call happened', async () => {
    renderHotel();
    await findAndSelect();
    // A `venue_user` cannot write guest.reservationRef/room (rules), and Ruling AS moved that
    // write into the charge handler. Between search and charge there must be exactly one call.
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it('noPostBehavior BLOCK: a refusal reads as information with a next step', async () => {
    renderHotel();
    // The server throws `no_post` only for a reservation its own fresh lookup found no-post, so
    // that is the reservation this scenario has to start from.
    await findAndSelect(NO_POST_RESERVATION);
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockRejectedValueOnce(WIRE_FAILED_PRECONDITION());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("can't accept charges")));
    expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('at the stand'));
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('M1: a failed_precondition that is NOT no-post never claims the room is flagged', async () => {
    // A suspended operator and an unconfigured PMS both throw `failed_precondition` from this same
    // callable, and the platform's `toHttpsError` puts the CODE on the wire as the message — so the
    // error is indistinguishable from a no-post refusal by code or message. This reservation is not
    // no-post, so the specific cause would be an invention; the sanitized generic error is correct.
    renderHotel();
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockRejectedValueOnce(WIRE_FAILED_PRECONDITION());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(requestMock).toHaveBeenCalledTimes(2); // lookup + charge, in that order
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(screen.queryByText(/Take payment from the guest at the stand/)).not.toBeInTheDocument();
  });

  it('M1: under fallback_card a thrown failed_precondition is never a no-post refusal', async () => {
    // Under `fallback_card` the handler RESOLVES for a no-post folio — it cannot throw `no_post` at
    // all — so even a no-post reservation must not attract the no-post copy here. This pins the
    // second half of the discriminator: dropping the `noPostBehavior === 'block'` check fails here.
    renderHotel(FALLBACK_HOTEL);
    await findAndSelect(NO_POST_RESERVATION);
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockRejectedValueOnce(WIRE_FAILED_PRECONDITION());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(requestMock).toHaveBeenCalledTimes(2); // lookup + charge, in that order
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it('L1: a no-post refusal stays on screen after the toast, and offers no dead retry', async () => {
    renderHotel();
    await findAndSelect(NO_POST_RESERVATION);
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockRejectedValueOnce(WIRE_FAILED_PRECONDITION());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    // Wait on the TOAST, not on the copy. The pre-charge warning ("The hotel has this room marked
    // no-post…") already contains "marked no-post", so waiting on that regex is satisfied before
    // the charge has settled and the assertions below then race the result render. The toast spy
    // cannot fire until the callable has rejected and the handler has run.
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining("can't accept charges")));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Take payment from the guest at the stand/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Charge room' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();

    // The dialog's own dismiss X shares the accessible name "Close" via an `sr-only` span; the
    // footer button is the one whose label is visible text. It dismisses without charging.
    const footerClose = within(dialog)
      .getAllByRole('button', { name: 'Close' })
      .find((b) => !b.querySelector('.sr-only'));
    expect(footerClose).toBeDefined();
    fireEvent.click(footerClose!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('noPostBehavior FALLBACK_CARD: a resolved fallback is not reported as success', async () => {
    renderHotel(FALLBACK_HOTEL);
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockImplementationOnce(() => ({ fallback: 'card' as const }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    // The callable RESOLVES here — nothing threw — but no money moved. Saying "Charged to room"
    // would be false.
    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('nothing was posted')));
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('L1: a fallback does NOT close the dialog the way a real charge does', async () => {
    // Closing is itself a success signal. When the only difference between "money moved" and
    // "nothing was posted" is a toast that expires, a host who looks away sees the same thing for
    // opposite outcomes — so the fallback holds the dialog with the copy inline.
    renderHotel(FALLBACK_HOTEL);
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockImplementationOnce(() => ({ fallback: 'card' as const }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('nothing was posted')));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/nothing was posted/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing was charged/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Charge room' })).not.toBeInTheDocument();
  });

  it('L1: a REAL charge does close the dialog, so the two outcomes stay distinguishable', async () => {
    renderHotel();
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Charged to room 501'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a genuine failure still sanitizes through toast.error', async () => {
    renderHotel();
    await findAndSelect();
    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    requestMock.mockRejectedValueOnce(new PlatformError('provider_unavailable', 'opera down'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.info).not.toHaveBeenCalled();

    // L1's differentiator, OTHER DIRECTION (review N3). The no-post tests pin that a TERMINAL
    // outcome collapses the dialog into a result screen; without this, collapsing a TRANSIENT
    // failure the same way — silently deleting Retry from the one outcome where retrying is the
    // right move — passed the entire suite. A transient failure keeps the picker and both buttons.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Charge room' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Guest's car/)).toBeInTheDocument();
  });

  it('will not charge until a car is chosen', async () => {
    renderHotel();
    await findAndSelect();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Charge room' })).toBeDisabled();
  });

  it('explains an empty car list instead of leaving an unusable picker', async () => {
    mockTickets = [];
    renderHotel();
    await findAndSelect();
    expect(screen.getByText(/No cars are checked in at your venue right now/)).toBeInTheDocument();
  });
});
