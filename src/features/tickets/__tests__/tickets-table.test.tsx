import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Ticket, User, Venue } from '@goldstar/platform';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { TicketsTable } from '../tickets-table';
import { TicketFilters } from '../filters';

const VENUE: Venue = { id: 'v1', operatorId: 'goldstar', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as unknown as Venue;

const ATTENDANT: User = { uid: 'att1', operatorId: 'goldstar', displayName: 'Ana Torres' } as unknown as User;

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    operatorId: 'goldstar',
    venueId: 'v1',
    jobType: 'valet',
    status: 'delivered',
    source: 'staff',
    guest: { phoneLast4: '1234', consentSms: true },
    vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { claimedBy: 'att1' },
    times: { checkedInAt: '2026-08-23T19:00:00.000Z' },
    damageReportIds: [],
    incidentIds: [],
    guestToken: 'x'.repeat(22),
    payment: { status: 'paid', base: 1500, tip: 300, tax: 105, fees: 0, total: 1905, currency: 'USD', billTo: 'guest' },
    metrics: { retrievalSec: 390 },
    ...over,
  } as unknown as Ticket;
}

const defaultProps = {
  venues: [VENUE],
  staffByUid: new Map([['att1', ATTENDANT]]),
  loading: false,
  hasSearched: true,
  hasMore: false,
  loadingMore: false,
  onLoadMore: vi.fn(),
};

describe('TicketsTable', () => {
  it('before any search, shows a prompt instead of a table', () => {
    render(<TicketsTable {...defaultProps} tickets={[]} hasSearched={false} />);
    expect(screen.getByText('Search for tickets')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders every brief-specified column with the right values for a row', () => {
    render(<TicketsTable {...defaultProps} tickets={[ticket()]} />);
    expect(screen.getByText('St. Elmo')).toBeInTheDocument(); // venue
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument(); // vehicle
    expect(screen.getByText('ABC123')).toBeInTheDocument(); // plate
    expect(screen.getByText('Delivered')).toBeInTheDocument(); // status
    expect(screen.getByText('Ana Torres')).toBeInTheDocument(); // attendant
    expect(screen.getByText('6m 30s')).toBeInTheDocument(); // retrieval time
    expect(screen.getByText('$19.05')).toBeInTheDocument(); // payment
    expect(screen.getByText('$3.00')).toBeInTheDocument(); // tip
  });

  it('an unassigned ticket shows "Unassigned" in the attendant column', () => {
    render(<TicketsTable {...defaultProps} tickets={[ticket({ attendants: {} })]} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('clicking a row navigates to the ticket detail page', () => {
    render(<TicketsTable {...defaultProps} tickets={[ticket({ id: 't-abc' })]} />);
    fireEvent.click(screen.getByRole('link', { name: /open ticket/i }));
    expect(push).toHaveBeenCalledWith('/tickets/t-abc');
  });

  it('shows "Load more" only when hasMore is true, and it calls onLoadMore', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<TicketsTable {...defaultProps} tickets={[ticket()]} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    rerender(<TicketsTable {...defaultProps} tickets={[ticket()]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a "no results" empty state for a completed search with zero matches', () => {
    render(<TicketsTable {...defaultProps} tickets={[]} hasSearched />);
    expect(screen.getByText('No tickets match')).toBeInTheDocument();
  });

  it('shows a loading state while searching', () => {
    render(<TicketsTable {...defaultProps} tickets={[]} hasSearched loading />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });
});

describe('TicketFilters', () => {
  it('submits from/to as ISO day-boundaries and omits every unset optional filter', () => {
    const onSearch = vi.fn();
    render(<TicketFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    const filters = onSearch.mock.calls[0]![0];
    expect(filters.from).toBe(new Date('2026-08-01T00:00:00').toISOString());
    expect(filters.to).toBe(new Date('2026-08-23T23:59:59.999').toISOString());
    expect(filters.includeArchived).toBe(false);
    expect(filters).not.toHaveProperty('venueId');
    expect(filters).not.toHaveProperty('status');
    expect(filters).not.toHaveProperty('jobType');
    expect(filters).not.toHaveProperty('plate');
    expect(filters).not.toHaveProperty('phoneLast4');
  });

  it('includes venueId/status/plate/phoneLast4/includeArchived once set', () => {
    const onSearch = vi.fn();
    render(<TicketFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'delivered' } });
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'ABC123' } });
    fireEvent.change(screen.getByLabelText('Phone last 4'), { target: { value: '1234' } });
    fireEvent.click(screen.getByLabelText('Include archived'));
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const filters = onSearch.mock.calls[0]![0];
    expect(filters).toMatchObject({ venueId: 'v1', status: 'delivered', plate: 'ABC123', phoneLast4: '1234', includeArchived: true });
  });

  it('uppercases the plate at submit (mirrors goldstar-mobile\'s write-side .toUpperCase(), matching how ticketsSearch\'s exact-match filter needs it)', () => {
    const onSearch = vi.fn();
    render(<TicketFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const filters = onSearch.mock.calls[0]![0];
    expect(filters.plate).toBe('ABC123');
  });

  it('the venue picker is hidden when the caller passes an empty restrictToVenueIds (e.g. a lead with no venues)', () => {
    render(<TicketFilters venues={[VENUE]} restrictToVenueIds={[]} onSearch={vi.fn()} />);
    expect(screen.queryByLabelText('Venue')).not.toBeInTheDocument();
  });
});
