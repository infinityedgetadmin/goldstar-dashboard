import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Incident, User, Venue } from '@goldstar/platform';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

import { IncidentsTable } from '../incidents-table';

const VENUE: Venue = { id: 'v1', operatorId: 'goldstar', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as unknown as Venue;
const REPORTER: User = { uid: 'att1', operatorId: 'goldstar', displayName: 'Ana Torres' } as unknown as User;
const ASSIGNEE: User = { uid: 'lead1', operatorId: 'goldstar', displayName: 'Jordan Lead' } as unknown as User;

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: '01912345-7abc-7def-8123-456789ab0001',
    operatorId: 'goldstar',
    venueId: 'v1',
    type: 'damage',
    description: 'Scratch on rear bumper',
    photos: [],
    reportedBy: 'att1',
    at: '2026-08-23T19:00:00.000Z',
    status: 'open',
    witnesses: [],
    ...over,
  } as unknown as Incident;
}

const staffByUid = new Map([
  ['att1', REPORTER],
  ['lead1', ASSIGNEE],
]);

beforeEach(() => {
  push.mockReset();
});

describe('IncidentsTable', () => {
  it('shows an empty state when there are no incidents', () => {
    render(<IncidentsTable incidents={[]} venues={[VENUE]} staffByUid={staffByUid} loading={false} />);
    expect(screen.getByText('No incidents reported')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    render(<IncidentsTable incidents={[]} venues={[VENUE]} staffByUid={staffByUid} loading />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders every brief-specified column: type, venue, reporter, ticket link, status, assigned', () => {
    render(
      <IncidentsTable
        incidents={[incident({ ticketId: '01912345-7abc-7def-8123-456789abcdef', assignedTo: 'lead1' })]}
        venues={[VENUE]}
        staffByUid={staffByUid}
        loading={false}
      />,
    );
    expect(screen.getByText('Damage')).toBeInTheDocument();
    expect(screen.getByText('St. Elmo')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '01912345' })).toHaveAttribute('href', '/tickets/01912345-7abc-7def-8123-456789abcdef');
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lead')).toBeInTheDocument();
  });

  it('shows "Unassigned" and a placeholder dash when there is no ticket link', () => {
    render(<IncidentsTable incidents={[incident()]} venues={[VENUE]} staffByUid={staffByUid} loading={false} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
    // The row itself also carries `role="link"` (click-to-open, same as tickets-table.tsx/
    // claims-table.tsx) — the ticket-cell link specifically is what's absent here.
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });

  it('clicking a row navigates to the incident detail page', () => {
    render(<IncidentsTable incidents={[incident({ id: 'inc-abc' })]} venues={[VENUE]} staffByUid={staffByUid} loading={false} />);
    fireEvent.click(screen.getByRole('link', { name: /open incident/i }));
    expect(push).toHaveBeenCalledWith('/incidents/inc-abc');
  });

  it("clicking the ticket link inside a row does not also trigger the row's own navigation", () => {
    render(
      <IncidentsTable
        incidents={[incident({ id: 'inc-abc', ticketId: '01912345-7abc-7def-8123-456789abcdef' })]}
        venues={[VENUE]}
        staffByUid={staffByUid}
        loading={false}
      />,
    );
    fireEvent.click(screen.getByRole('link', { name: '01912345' }));
    expect(push).not.toHaveBeenCalledWith('/incidents/inc-abc');
  });
});
