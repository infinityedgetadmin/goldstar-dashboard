import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Incident, User } from '@goldstar/platform';

let mockSession: { claims?: { operatorId: string; roles: string[]; venueIds: string[] } } = {};
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

const DELETE_FIELD_SENTINEL = Symbol('deleteField');
const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, data: unknown) => updateDocMock(ref.path, data),
  deleteField: () => DELETE_FIELD_SENTINEL,
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

let currentIncident: Incident | undefined;
const STAFF: User[] = [
  { uid: 'att1', operatorId: 'goldstar', displayName: 'Ana Torres' } as unknown as User,
  { uid: 'lead1', operatorId: 'goldstar', displayName: 'Jordan Lead' } as unknown as User,
];

const useDocMock = vi.fn((path: string | undefined) => {
  if (!path) return { data: undefined, loading: false };
  if (path.includes('/incidents/')) return { data: currentIncident, loading: false };
  if (path.includes('/venues/')) return { data: { name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' }, loading: false };
  return { data: undefined, loading: false };
});
const useCollectionMock = vi.fn((path: string | undefined) => (path ? { data: STAFF, loading: false } : { data: [], loading: false }));
vi.mock('@/lib/firebase/hooks', () => ({
  useDoc: (...args: unknown[]) => useDocMock(...(args as [string | undefined])),
  useCollection: (...args: unknown[]) => useCollectionMock(...(args as [string | undefined])),
}));

vi.mock('@/features/tickets/use-storage-photo-url', () => ({ useStoragePhotoUrl: () => ({ url: undefined, loading: false }) }));

import { IncidentDetail } from '../incident-detail';

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-1',
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

beforeEach(() => {
  updateDocMock.mockClear();
  mockSession = { claims: { operatorId: 'goldstar', roles: ['owner'], venueIds: [] } };
  currentIncident = incident();
});

describe('IncidentDetail', () => {
  it('shows a not-found state when the incident does not exist (or is not accessible)', () => {
    currentIncident = undefined;
    render(<IncidentDetail incidentId="missing" />);
    expect(screen.getByText('Incident not found')).toBeInTheDocument();
  });

  it('renders type, venue, description, reporter, and status', () => {
    render(<IncidentDetail incidentId="inc-1" />);
    expect(screen.getByText('Incident · Damage')).toBeInTheDocument();
    expect(screen.getByText('Scratch on rear bumper')).toBeInTheDocument();
    expect(screen.getByText('Reported by Ana Torres')).toBeInTheDocument();
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0);
  });

  it('renders a ticket link when the incident is linked to one', () => {
    currentIncident = incident({ ticketId: '01912345-7abc-7def-8123-456789abcdef' });
    render(<IncidentDetail incidentId="inc-1" />);
    expect(screen.getByRole('link', { name: /Ticket/ })).toHaveAttribute('href', '/tickets/01912345-7abc-7def-8123-456789abcdef');
  });

  it('renders witnesses when present, and omits the card when empty', () => {
    const { rerender } = render(<IncidentDetail incidentId="inc-1" />);
    expect(screen.queryByText('Witnesses')).not.toBeInTheDocument();

    currentIncident = incident({ witnesses: [{ name: 'Sam Guest', contact: '317-555-0100' }] });
    rerender(<IncidentDetail incidentId="inc-1" />);
    expect(screen.getByText('Witnesses')).toBeInTheDocument();
    expect(screen.getByText('Sam Guest')).toBeInTheDocument();
    expect(screen.getByText('317-555-0100')).toBeInTheDocument();
  });

  it('changing status writes the new status via updateDoc, not a callable', async () => {
    render(<IncidentDetail incidentId="inc-1" />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'reviewing' } });
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledWith('operators/goldstar/incidents/inc-1', { status: 'reviewing' }));
  });

  it('assigning a staff member writes assignedTo', async () => {
    render(<IncidentDetail incidentId="inc-1" />);
    fireEvent.change(screen.getByLabelText('Assigned to'), { target: { value: 'lead1' } });
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledWith('operators/goldstar/incidents/inc-1', { assignedTo: 'lead1' }));
  });

  it('clearing the assignee back to "Unassigned" writes deleteField(), not null', async () => {
    currentIncident = incident({ assignedTo: 'lead1' });
    render(<IncidentDetail incidentId="inc-1" />);
    fireEvent.change(screen.getByLabelText('Assigned to'), { target: { value: '' } });
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledWith('operators/goldstar/incidents/inc-1', { assignedTo: DELETE_FIELD_SENTINEL }));
  });

  it('renders the photos section with an empty state when there are no photos', () => {
    render(<IncidentDetail incidentId="inc-1" />);
    expect(screen.getByText('No photos')).toBeInTheDocument();
  });
});
