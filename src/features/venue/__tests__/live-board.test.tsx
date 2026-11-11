import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { Ticket, Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';

const { requestMock, toastMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', async () => {
  // MINOR-2: the mock parses the REAL payload against the REAL installed contract (input
  // and output) — see contract-checked-callable.ts.
  const { contractCheckedCallable } = await import('./contract-checked-callable');
  return { callable: contractCheckedCallable(requestMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

let mockTickets: Ticket[] = [];
let mockLoading = false;
let mockError = false;
const retryMock = vi.fn();
vi.mock('../use-venue-tickets', () => ({
  useVenueTickets: () => ({ tickets: mockTickets, loading: mockLoading, error: mockError, retry: retryMock }),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import { LiveBoard, waitSince } from '../live-board';

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1', type: 'restaurant', status: 'active' } as unknown as Venue;

function ticket(over: Partial<Ticket> & { id: string }): Ticket {
  return {
    operatorId: 'op1',
    venueId: 'v1',
    jobType: 'valet',
    status: 'checked_in',
    source: 'staff',
    guest: { phoneLast4: '0142', name: 'Ana', consentSms: true },
    vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: {},
    times: { checkedInAt: new Date(Date.now() - 90 * 60_000).toISOString() },
    damageReportIds: [],
    incidentIds: [],
    guestToken: 'x'.repeat(22),
    ...over,
  } as unknown as Ticket;
}

function renderBoard() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <LiveBoard />
    </VenueProvider>
  );
}

beforeEach(() => {
  mockTickets = [];
  mockLoading = false;
  mockError = false;
  retryMock.mockReset();
  requestMock.mockReset().mockResolvedValue({ hostRequestId: 'hr1', ticketId: '11111111-1111-7111-8111-111111111111' });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
  mockSession = { uid: 'host1', claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 } } as Partial<Session>;
});

describe('waitSince', () => {
  it('renders minutes under an hour', () => {
    expect(waitSince('2026-08-30T10:00:00.000Z', Date.parse('2026-08-30T10:42:00.000Z'))).toBe('42m');
  });
  it('renders hours and minutes past an hour', () => {
    expect(waitSince('2026-08-30T10:00:00.000Z', Date.parse('2026-08-30T12:05:00.000Z'))).toBe('2h 5m');
  });
  it('clamps a future check-in to zero', () => {
    expect(waitSince('2026-08-30T10:00:00.000Z', Date.parse('2026-08-30T09:59:00.000Z'))).toBe('0m');
  });
});

describe('LiveBoard', () => {
  it('renders vehicle summary, plate, status pill and wait time for each ticket', () => {
    mockTickets = [ticket({ id: 't1' })];
    renderBoard();

    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument();
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('Parked')).toBeInTheDocument();
    expect(screen.getByText('1h 30m')).toBeInTheDocument();
  });

  it('shows assistance and accessible flags only when set', () => {
    mockTickets = [
      ticket({ id: 't1', flags: { assistance: true, accessibleVehicle: true, photosSkipped: false, vip: false } }),
      ticket({ id: 't2', vehicle: { color: 'Red', make: 'Kia', model: 'Soul' } as Ticket['vehicle'] }),
    ];
    renderBoard();

    expect(screen.getByText('Needs assistance')).toBeInTheDocument();
    expect(screen.getByText('Accessible')).toBeInTheDocument();
  });

  it('offers "Request car" only on checked_in rows', () => {
    mockTickets = [ticket({ id: 't1' }), ticket({ id: 't2', status: 'retrieving' as Ticket['status'] })];
    renderBoard();

    expect(screen.getAllByRole('button', { name: /^Request car:/ })).toHaveLength(1);
  });

  it('SECURITY: a row action calls venueHostRequest with the claimed venue id and the row ticket phone', async () => {
    mockTickets = [ticket({ id: 't1' })];
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Request car: Blue Honda Civic' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', kind: 'car', phoneLast4: '0142', name: 'Ana' })
    );
    expect(toastMock.success).toHaveBeenCalledWith('Car requested');
  });

  it('shows the unmatched copy when the handler finds no ticket', async () => {
    requestMock.mockResolvedValueOnce({ hostRequestId: 'hr1' });
    mockTickets = [ticket({ id: 't1' })];
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Request car: Blue Honda Civic' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith('No ticket found — the valet stand has been notified'));
  });

  it('shows a sanitized error toast when the request fails, and re-enables the row button', async () => {
    const failure = new Error('boom');
    requestMock.mockRejectedValueOnce(failure);
    mockTickets = [ticket({ id: 't1' })];
    renderBoard();

    const button = screen.getByRole('button', { name: 'Request car: Blue Honda Civic' });
    fireEvent.click(button);

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(failure));
    expect(screen.getByRole('button', { name: 'Request car: Blue Honda Civic' })).not.toBeDisabled();
  });

  it('shows the empty state when there are no active tickets', () => {
    renderBoard();
    expect(screen.getByText('No cars right now')).toBeInTheDocument();
  });

  it('shows an error state with a working Retry when the listeners fail', () => {
    mockError = true;
    renderBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retryMock).toHaveBeenCalledTimes(1);
  });

  it('names the active venue in the page header', () => {
    renderBoard();
    const header = screen.getByRole('heading', { level: 1, name: 'Live board' });
    expect(header).toBeInTheDocument();
    expect(screen.getByText(/The Grill — cars on the stand right now\./)).toBeInTheDocument();
  });

  it('filters rows by the vehicle search box', async () => {
    mockTickets = [ticket({ id: 't1' }), ticket({ id: 't2', vehicle: { color: 'Red', make: 'Kia', model: 'Soul' } as Ticket['vehicle'] })];
    renderBoard();

    fireEvent.change(screen.getByPlaceholderText('Filter vehicles…'), { target: { value: 'Kia' } });

    const table = screen.getByRole('table');
    await waitFor(() => {
      expect(within(table).getByText('Red Kia Soul')).toBeInTheDocument();
      expect(within(table).queryByText('Blue Honda Civic')).not.toBeInTheDocument();
    });
  });
});
