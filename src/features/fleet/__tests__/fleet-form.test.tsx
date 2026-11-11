import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FleetVehicle } from '@goldstar/platform';

const setDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});

/** Same rigor as venue-form.test.tsx: mirrors real Firestore's actual rejection of a bare
 * `undefined` field value (`deleteField()`'s sentinel is the only allowed exception), so every test
 * here is a structural regression guard against `currentDriverUid`/optional-field bugs, not just the
 * ones that assert on the payload directly. */
export const DELETE_FIELD_SENTINEL = { __isDeleteFieldSentinel: true } as const;
function assertNoUndefinedFirestoreValue(data: unknown, path = ''): void {
  if (data === DELETE_FIELD_SENTINEL) return;
  if (data === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path || '(root)'})`);
  if (Array.isArray(data)) {
    data.forEach((v, i) => assertNoUndefinedFirestoreValue(v, `${path}[${i}]`));
    return;
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      assertNoUndefinedFirestoreValue(v, path ? `${path}.${k}` : k);
    }
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  deleteField: () => DELETE_FIELD_SENTINEL,
  setDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return setDocMock(ref.path, data);
  },
  updateDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return updateDocMock(ref.path, data);
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));
vi.mock('@goldstar/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@goldstar/platform')>();
  return { ...actual, uuidv7: () => 'new-vehicle-id' };
});

import { FleetForm } from '../fleet-form';

const VEHICLE: FleetVehicle = {
  id: 'v1',
  operatorId: 'goldstar',
  plate: 'GS-100',
  state: 'IN',
  make: 'Mercedes',
  model: 'Sprinter',
  color: 'White',
  capacity: 6,
  accessible: true,
  status: 'available',
  notes: 'Roof rack removed',
};

// Mocks accumulate call history across the whole file (no clearMocks configured, same as
// venue-form.test.tsx) — clear so `.not.toHaveBeenCalled()`/`.calls[0]` assertions reflect only
// the current test.
beforeEach(() => {
  setDocMock.mockClear();
  updateDocMock.mockClear();
});

describe('FleetForm', () => {
  it('creates a new vehicle, minting an id and never sending currentDriverUid', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" />);
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'GS-200' } });
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Ford' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Transit' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'Black' } });
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));

    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [path, data] = setDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar/fleetVehicles/new-vehicle-id');
    expect(data).toMatchObject({ id: 'new-vehicle-id', operatorId: 'goldstar', plate: 'GS-200', make: 'Ford', model: 'Transit', color: 'Black', capacity: 8, status: 'available', accessible: false });
    expect(data).not.toHaveProperty('currentDriverUid');
  });

  it('edits an existing vehicle, sending only an update (not a create) and preserving the id', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" vehicle={VEHICLE} />);
    fireEvent.change(screen.getByLabelText('Capacity'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    expect(setDocMock).not.toHaveBeenCalled();
    const [path, data] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('operators/goldstar/fleetVehicles/v1');
    expect(data).toMatchObject({ capacity: 7, plate: 'GS-100' });
  });

  it('clearing an optional field (state) on edit sends deleteField(), not an omitted key', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" vehicle={VEHICLE} />);
    fireEvent.change(screen.getByLabelText('State'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    const [, data] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(data.state).toBe(DELETE_FIELD_SENTINEL);
  });

  it('toggling accessible off is reflected in the submitted payload', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" vehicle={VEHICLE} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Wheelchair-accessible' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalled());
    const [, data] = updateDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(data.accessible).toBe(false);
  });

  it('rejects a plate left blank', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    // zod's default z.string().min(1) message ("String must contain at least 1 character(s)") —
    // matched loosely since the exact wording is a zod-version detail, not this form's contract.
    expect(await screen.findByText(/at least 1 character/i)).toBeInTheDocument();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('rejects a state that is not exactly 2 characters', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" />);
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'GS-200' } });
    fireEvent.change(screen.getByLabelText('State'), { target: { value: 'IND' } });
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Ford' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Transit' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'Black' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    expect(await screen.findByText(/exactly 2 character/i)).toBeInTheDocument();
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('an empty state clears rather than failing 2-character validation', async () => {
    render(<FleetForm open onOpenChange={() => {}} operatorId="goldstar" />);
    fireEvent.change(screen.getByLabelText('Plate'), { target: { value: 'GS-200' } });
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Ford' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Transit' } });
    fireEvent.change(screen.getByLabelText('Color'), { target: { value: 'Black' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add vehicle' }));
    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    const [, data] = setDocMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(data).not.toHaveProperty('state');
  });
});
