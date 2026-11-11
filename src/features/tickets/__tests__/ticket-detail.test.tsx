import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Ticket, Venue } from '@goldstar/platform';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

let mockSession: { claims?: { operatorId: string; roles: string[]; venueIds: string[] } } = {};
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

const VENUE: Venue = { id: 'v1', operatorId: 'goldstar', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as unknown as Venue;

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
    ...over,
  } as unknown as Ticket;
}

let currentTicket: Ticket | undefined = ticket();
const useDocMock = vi.fn((_path: string | undefined) => ({ data: currentTicket, loading: false }));
const useCollectionMock = vi.fn((path: string | undefined) => {
  if (!path) return { data: [], loading: false };
  if (path.endsWith('/venues')) return { data: [VENUE], loading: false };
  return { data: [], loading: false };
});
vi.mock('@/lib/firebase/hooks', () => ({
  useDoc: (...args: unknown[]) => useDocMock(...(args as [string | undefined])),
  useCollection: (...args: unknown[]) => useCollectionMock(...(args as [string | undefined])),
}));

vi.mock('../use-ticket-photos', () => ({ useTicketPhotos: () => ({ photos: [], loading: false }) }));

const callableFn = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => callableFn }));

import { TicketDetail } from '../ticket-detail';

beforeEach(() => {
  callableFn.mockReset();
  push.mockReset();
  currentTicket = ticket();
  mockSession = { claims: { operatorId: 'goldstar', roles: ['owner'], venueIds: [] } };
});

describe('TicketDetail: reveal-phone flow', () => {
  it('masks the phone by default and shows a Reveal button for an owner', () => {
    render(<TicketDetail ticketId="t1" />);
    expect(screen.getByText('•••• 1234')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reveal' })).toBeInTheDocument();
  });

  it('reveal calls ticketsRevealPhone with {ticketId, reason}, shows the E.164 number, and marks it as audited', async () => {
    callableFn.mockResolvedValue({ phoneE164: '+13175551234' });
    render(<TicketDetail ticketId="t1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    fireEvent.change(screen.getByLabelText('Reason for revealing phone number'), { target: { value: 'guest called about a lost item' } });
    // Two "Reveal" buttons now exist: the trigger (in the guest card) and the dialog's own submit
    // button — the dialog's is the one added most recently, so it's last in DOM order.
    const revealButtons = screen.getAllByRole('button', { name: 'Reveal' });
    fireEvent.click(revealButtons[revealButtons.length - 1]!);

    await waitFor(() => expect(callableFn).toHaveBeenCalledWith({ ticketId: 't1', reason: 'guest called about a lost item' }));
    expect(await screen.findByText('(317) 555-1234')).toBeInTheDocument();
    expect(screen.getByText(/this action was audited/i)).toBeInTheDocument();
    // The masked form and the Reveal trigger are both gone once revealed.
    expect(screen.queryByText('•••• 1234')).not.toBeInTheDocument();
  });

  it('a QR-only guest (sentinel phoneLast4 0000) shows the house no-phone copy and no Reveal button at all', () => {
    currentTicket = ticket({ guest: { phoneLast4: '0000', consentSms: false } } as Partial<Ticket>);
    render(<TicketDetail ticketId="t1" />);
    expect(screen.getByText('No phone — QR only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal' })).not.toBeInTheDocument();
  });

  it('a lead does not see the Reveal button (admin+ only, per ticketsRevealPhone\'s server-side gate)', () => {
    mockSession = { claims: { operatorId: 'goldstar', roles: ['lead'], venueIds: ['v1'] } };
    render(<TicketDetail ticketId="t1" />);
    expect(screen.getByText('•••• 1234')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal' })).not.toBeInTheDocument();
  });
});

describe('TicketDetail: not found', () => {
  it('shows a not-found state (with a link back) when the ticket doc does not exist', () => {
    currentTicket = undefined;
    render(<TicketDetail ticketId="missing" />);
    expect(screen.getByText('Ticket not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to tickets/i })).toHaveAttribute('href', '/tickets');
  });
});
