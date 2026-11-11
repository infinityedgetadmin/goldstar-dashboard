import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Ticket, User, Venue } from '@goldstar/platform';

// Final whole-branch review, final-wave item 11: no test anywhere previously exercised
// TicketDrawer's OPEN state — the SheetDescription "verification" in an earlier task was
// structurally vacuous (nothing ever rendered the component with a ticket). This file closes that
// gap: proves the drawer actually opens, its content (title/description/status/vehicle/assignee)
// renders, TicketQuickActions is mounted with the right ticket, and closing/navigating work.

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// TicketQuickActions pulls in Firebase/session/dialog machinery that's already covered by its own
// tests (via live-board.test.tsx) — mocked here to keep this file scoped to the drawer's own
// rendering/open-state behavior, while still proving "quick actions render" with the right ticket.
vi.mock('../ticket-quick-actions', () => ({
  TicketQuickActions: ({ ticket }: { ticket: Ticket }) => <div data-testid="quick-actions">{ticket.id}</div>,
}));

import { TicketDrawer } from '../ticket-drawer';

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
  zoneId: 'A',
  guestToken: 'x'.repeat(22),
} as unknown as Ticket;

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

const STAFF_BY_UID = new Map<string, User>([['att1', ANA]]);

beforeEach(() => {
  push.mockClear();
});

describe('TicketDrawer', () => {
  it('renders closed (no sheet content in the document) when ticket is undefined', () => {
    render(<TicketDrawer operatorId="goldstar" ticket={undefined} venue={VENUE} staff={[ANA]} staffByUid={STAFF_BY_UID} onOpenChange={vi.fn()} />);
    expect(screen.queryByText('Ticket status, vehicle, and quick actions.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('quick-actions')).not.toBeInTheDocument();
  });

  it('opens with the ticket summary title, description, status, vehicle, assignee, and quick actions when a ticket is provided', () => {
    render(<TicketDrawer operatorId="goldstar" ticket={TICKET} venue={VENUE} staff={[ANA]} staffByUid={STAFF_BY_UID} onOpenChange={vi.fn()} />);

    // The drawer is genuinely open — Radix mounts SheetContent (via a portal) into the document.
    expect(screen.getByText('Blue Honda Civic')).toBeInTheDocument(); // SheetTitle via ticketSummary()
    expect(screen.getByText('Ticket status, vehicle, and quick actions.')).toBeInTheDocument(); // SheetDescription
    expect(screen.getByText('Retrieving')).toBeInTheDocument(); // STATUS_LABEL['retrieving']
    expect(screen.getByText(/Blue Honda Civic · ABC123/)).toBeInTheDocument(); // vehicle line + plate
    expect(screen.getByText('A')).toBeInTheDocument(); // zoneId
    expect(screen.getByText('Assigned to Ana')).toBeInTheDocument(); // claimedBy resolved via staffByUid

    const quickActions = screen.getByTestId('quick-actions');
    expect(quickActions).toHaveTextContent('t1'); // TicketQuickActions mounted with THIS ticket

    expect(screen.getByRole('button', { name: 'Open full ticket' })).toBeInTheDocument();
  });

  it('shows "Unassigned" when the ticket has no claimedBy/primaryDriverUid', () => {
    const unassigned = { ...TICKET, attendants: {} } as unknown as Ticket;
    render(<TicketDrawer operatorId="goldstar" ticket={unassigned} venue={VENUE} staff={[ANA]} staffByUid={STAFF_BY_UID} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('falls back to the raw uid when the assignee is not found in staffByUid', () => {
    render(<TicketDrawer operatorId="goldstar" ticket={TICKET} venue={VENUE} staff={[]} staffByUid={new Map()} onOpenChange={vi.fn()} />);
    expect(screen.getByText('Assigned to att1')).toBeInTheDocument();
  });

  it('clicking "Open full ticket" navigates to the ticket detail page', () => {
    render(<TicketDrawer operatorId="goldstar" ticket={TICKET} venue={VENUE} staff={[ANA]} staffByUid={STAFF_BY_UID} onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full ticket' }));
    expect(push).toHaveBeenCalledWith('/tickets/t1');
  });

  it('dismissing the sheet (Escape) calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(<TicketDrawer operatorId="goldstar" ticket={TICKET} venue={VENUE} staff={[ANA]} staffByUid={STAFF_BY_UID} onOpenChange={onOpenChange} />);
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
