import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User, Venue } from '@goldstar/platform';

const updateDocMock = vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {});
const { toastMock } = vi.hoisted(() => ({ toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

/** Same "reject an own key set to bare `undefined`" guard as `venue-form.test.tsx` (task-5) — real
 * Firestore throws for this; a bare pass-through mock can't catch the regression class at all. */
function assertNoUndefinedFirestoreValue(data: unknown, path = ''): void {
  if (data === undefined) throw new Error(`Unsupported field value: undefined (found in field ${path || '(root)'})`);
  if (Array.isArray(data)) {
    data.forEach((v, i) => assertNoUndefinedFirestoreValue(v, `${path}[${i}]`));
    return;
  }
  if (data !== null && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      assertNoUndefinedFirestoreValue(v, path ? `${path}.${k}` : k);
    }
  }
}

vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, data: unknown) => {
    assertNoUndefinedFirestoreValue(data);
    return updateDocMock(ref.path, data);
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

let sessionRoles: string[] = ['admin'];
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({ claims: { operatorId: 'goldstar', roles: sessionRoles } }),
}));

import { UserEditor } from '../user-editor';

const VENUES: Venue[] = [
  { id: 'v1', name: 'St. Elmo' } as Venue,
  { id: 'v2', name: 'Union Station' } as Venue,
];

function baseUser(over: Partial<User> = {}): User {
  return {
    uid: 'u1',
    operatorId: 'goldstar',
    displayName: 'Dana Driver',
    email: 'dana@x.example.com',
    roles: ['attendant'],
    venueIds: ['v1'],
    status: 'active',
    eligibility: { driveHome: false, passengerRide: false, reasons: [] },
    fcmTokens: [],
    invitedAt: '2026-01-01T00:00:00.000Z',
    payoutStatus: 'none',
    ...over,
  };
}

beforeEach(() => {
  updateDocMock.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.info.mockClear();
  sessionRoles = ['admin'];
});

describe('UserEditor', () => {
  it('submits added role, added venue, and a status change to suspended', async () => {
    render(<UserEditor operatorId="goldstar" user={baseUser()} venues={VENUES} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Driver' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Union Station' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, payload] = updateDocMock.mock.calls[0] as [string, { roles: string[]; venueIds: string[]; status: string; externalIds?: Record<string, string> }];
    expect(path).toBe('operators/goldstar/users/u1');
    // Canonical EDITABLE_ROLES order (owner, admin, lead, attendant, driver, venue_user), not click order.
    expect(payload.roles).toEqual(['attendant', 'driver']);
    expect(payload.venueIds).toEqual(['v1', 'v2']);
    expect(payload.status).toBe('suspended');
    // Fix round 1 (task-6-review.md Major 2/3 discipline): externalIds was never touched — the
    // payload must OMIT the key entirely, not send an empty-but-present `{}`.
    expect(Object.hasOwn(payload, 'externalIds')).toBe(false);
  });

  it('fix round 1 (Major 3): a non-owner admin edits venues/status on an owner-role user without touching roles — roles is excluded from the payload and the save succeeds', async () => {
    render(<UserEditor operatorId="goldstar" user={baseUser({ roles: ['owner'] })} venues={VENUES} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Union Station' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, { roles?: string[]; venueIds: string[]; status: string }];
    expect(Object.hasOwn(payload, 'roles')).toBe(false);
    expect(payload.venueIds).toEqual(['v1', 'v2']);
    expect(payload.status).toBe('suspended');
  });

  it('fix round 1 (Major 3): a non-owner admin who DOES touch the roles group on an owner-role user is blocked client-side with specific copy — no updateDoc call at all', async () => {
    render(<UserEditor operatorId="goldstar" user={baseUser({ roles: ['owner'] })} venues={VENUES} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Driver' })); // Owner stays checked+disabled; roles still contains 'owner'
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith("Only an owner can change an owner's roles."));
    expect(updateDocMock).not.toHaveBeenCalled();
  });

  it('the Owner checkbox is disabled for a caller who is neither owner nor platform_admin, and enabled for an owner', async () => {
    const { rerender } = render(<UserEditor operatorId="goldstar" user={baseUser({ roles: ['admin'] })} venues={VENUES} />);
    expect(screen.getByRole('checkbox', { name: 'Owner' })).toBeDisabled();

    sessionRoles = ['owner'];
    rerender(<UserEditor operatorId="goldstar" user={baseUser({ roles: ['admin'] })} venues={VENUES} />);
    expect(screen.getByRole('checkbox', { name: 'Owner' })).not.toBeDisabled();
  });

  it('adds and removes an external id row; submits the resulting map', async () => {
    render(<UserEditor operatorId="goldstar" user={baseUser()} venues={VENUES} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add external id' }));
    fireEvent.change(screen.getByLabelText('External id provider 1'), { target: { value: 'deputy' } });
    fireEvent.change(screen.getByLabelText('External id value 1'), { target: { value: 'dep-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add external id' }));
    fireEvent.change(screen.getByLabelText('External id provider 2'), { target: { value: 'when-i-work' } });
    fireEvent.change(screen.getByLabelText('External id value 2'), { target: { value: 'wiw-456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove external id 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [, payload] = updateDocMock.mock.calls[0] as [string, { externalIds: Record<string, string> }];
    expect(payload.externalIds).toEqual({ 'when-i-work': 'wiw-456' });
  });

  it('pre-checks the user\'s current roles, venues, and status on load', () => {
    render(<UserEditor operatorId="goldstar" user={baseUser({ roles: ['attendant', 'driver'], venueIds: ['v1', 'v2'], status: 'suspended' })} venues={VENUES} />);
    expect(screen.getByRole('checkbox', { name: 'Attendant' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Driver' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Lead' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'St. Elmo' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Union Station' })).toBeChecked();
    expect(screen.getByLabelText('Status')).toHaveValue('suspended');
  });

  it('loads existing externalIds into editable rows', () => {
    render(<UserEditor operatorId="goldstar" user={baseUser({ externalIds: { deputy: 'dep-123' } })} venues={VENUES} />);
    expect(screen.getByLabelText('External id provider 1')).toHaveValue('deputy');
    expect(screen.getByLabelText('External id value 1')).toHaveValue('dep-123');
  });
});
