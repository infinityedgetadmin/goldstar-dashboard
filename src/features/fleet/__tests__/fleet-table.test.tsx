import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FleetVehicle, User } from '@goldstar/platform';

const deleteDocMock = vi.fn<(path: string) => Promise<void>>(async () => {});
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, path: string) => ({ path }),
  deleteDoc: (ref: { path: string }) => deleteDocMock(ref.path),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

const driver: User = { uid: 'd1', displayName: 'Sam Driver', email: 'sam@x.example.com', operatorId: 'goldstar', roles: ['driver'], status: 'active', invitedAt: 'x' } as unknown as User;
const vehicles: FleetVehicle[] = [
  { id: 'v1', operatorId: 'goldstar', plate: 'GS-100', make: 'Mercedes', model: 'Sprinter', color: 'White', capacity: 6, accessible: true, status: 'available' } as unknown as FleetVehicle,
  { id: 'v2', operatorId: 'goldstar', plate: 'GS-200', make: 'Ford', model: 'Transit', color: 'Black', capacity: 8, accessible: false, status: 'in_use', currentDriverUid: 'd1' } as unknown as FleetVehicle,
];

const useCollectionMock = vi.fn();
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: (path: string | undefined) => useCollectionMock(path) }));

let sessionRoles: string[] = ['owner'];
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({ status: 'signed_in', claims: { operatorId: 'goldstar', roles: sessionRoles, venueIds: [], claimsVersion: 1 }, isPlatformAdmin: false }),
}));

// FleetForm itself is unit-tested separately (fleet-form.test.tsx) — stubbed here so this file
// tests FleetTable's own behavior (columns, filters, edit/delete gating) in isolation.
vi.mock('../fleet-form', () => ({ FleetForm: ({ vehicle }: { vehicle?: FleetVehicle }) => <div data-testid="fleet-form">{vehicle ? `Editing ${vehicle.plate}` : 'New vehicle form'}</div> }));

import { FleetTable } from '../fleet-table';

beforeEach(() => {
  sessionRoles = ['owner'];
  deleteDocMock.mockClear();
  useCollectionMock.mockReset();
  useCollectionMock.mockImplementation((path: string | undefined) => {
    if (path?.endsWith('/fleetVehicles')) return { data: vehicles, loading: false, error: null };
    if (path?.endsWith('/users')) return { data: [driver], loading: false, error: null };
    return { data: [], loading: false, error: null };
  });
});

describe('FleetTable', () => {
  it('lists every vehicle with plate, vehicle description, status, and resolved current-driver name', () => {
    render(<FleetTable operatorId="goldstar" />);
    expect(screen.getByText('GS-100')).toBeInTheDocument();
    expect(screen.getByText('White Mercedes Sprinter')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Sam Driver')).toBeInTheDocument(); // resolved from currentDriverUid via staffByUid
  });

  it('shows an em dash for a vehicle with no current driver', () => {
    render(<FleetTable operatorId="goldstar" />);
    // GS-100 has no currentDriverUid.
    const rows = screen.getAllByText('—');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('an owner sees both Edit and Delete actions; clicking Add vehicle opens the create form', () => {
    render(<FleetTable operatorId="goldstar" />);
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Delete' }).length).toBe(2);

    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    expect(screen.getByText('New vehicle form')).toBeInTheDocument();
  });

  it('clicking Edit on a row opens the form pre-loaded with that vehicle', () => {
    render(<FleetTable operatorId="goldstar" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByText('Editing GS-200')).toBeInTheDocument();
  });

  it('a non-owner admin can create/edit but not delete', () => {
    sessionRoles = ['admin'];
    render(<FleetTable operatorId="goldstar" />);
    expect(screen.getByRole('button', { name: 'Add vehicle' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit' }).length).toBe(2);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('delete asks for confirmation, then calls deleteDoc with the vehicle path', async () => {
    render(<FleetTable operatorId="goldstar" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);
    const dialog = screen.getByRole('dialog', { name: 'Delete GS-100?' });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' })); // confirm button inside the dialog

    await waitFor(() => expect(deleteDocMock).toHaveBeenCalledWith('operators/goldstar/fleetVehicles/v1'));
  });

  it('shows a loading state, then an empty state when there are no vehicles', () => {
    useCollectionMock.mockImplementation((path: string | undefined) => {
      if (path?.endsWith('/fleetVehicles')) return { data: [], loading: true, error: null };
      return { data: [], loading: false, error: null };
    });
    const { rerender } = render(<FleetTable operatorId="goldstar" />);
    expect(screen.getByText('Loading fleet…')).toBeInTheDocument();

    useCollectionMock.mockImplementation((path: string | undefined) => {
      if (path?.endsWith('/fleetVehicles')) return { data: [], loading: false, error: null };
      return { data: [], loading: false, error: null };
    });
    rerender(<FleetTable operatorId="goldstar" />);
    expect(screen.getByText('No vehicles yet')).toBeInTheDocument();
  });
});
