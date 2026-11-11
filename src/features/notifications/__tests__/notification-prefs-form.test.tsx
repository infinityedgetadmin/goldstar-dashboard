import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User } from '@goldstar/platform';

const { updateDocMock, useDocMock, toastMock } = vi.hoisted(() => ({
  updateDocMock: vi.fn<(path: string, data: unknown) => Promise<void>>(async () => {}),
  useDocMock: vi.fn((_path: string | undefined) => ({ data: undefined as unknown, loading: false })),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  updateDoc: (ref: { path: string }, data: unknown) => updateDocMock(ref.path, data),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));
vi.mock('@/lib/firebase/hooks', () => ({ useDoc: (path: string | undefined) => useDocMock(path) }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

import { NotificationPrefsForm } from '../notification-prefs-form';

const USER: User = {
  uid: 'att1',
  operatorId: 'goldstar',
  roles: ['attendant'],
  venueIds: ['v1'],
  status: 'active',
  displayName: 'Sam',
  notificationPrefs: { emailClaims: true, emailCredentials: false, pushRequests: true },
} as unknown as User;

beforeEach(() => {
  updateDocMock.mockReset().mockResolvedValue(undefined);
  useDocMock.mockReset().mockReturnValue({ data: undefined, loading: false });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('NotificationPrefsForm', () => {
  it('shows a loading state while the user doc is loading', () => {
    useDocMock.mockReturnValue({ data: undefined, loading: true });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('renders each preference reflecting the loaded doc', () => {
    useDocMock.mockReturnValue({ data: USER, loading: false });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    expect(screen.getByLabelText('Damage claim updates')).toBeChecked();
    expect(screen.getByLabelText('Credential expirations')).not.toBeChecked();
    expect(screen.getByLabelText('Ride/vehicle requests')).toBeChecked();
  });

  it('defaults to all-on when the user has never set notificationPrefs before', () => {
    useDocMock.mockReturnValue({ data: { ...USER, notificationPrefs: undefined }, loading: false });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    expect(screen.getByLabelText('Damage claim updates')).toBeChecked();
    expect(screen.getByLabelText('Credential expirations')).toBeChecked();
    expect(screen.getByLabelText('Ride/vehicle requests')).toBeChecked();
  });

  it('Save is disabled until a preference is toggled', () => {
    useDocMock.mockReturnValue({ data: USER, loading: false });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled();
  });

  it('toggling a preference and saving writes the whole notificationPrefs object to users/{uid}', async () => {
    useDocMock.mockReturnValue({ data: USER, loading: false });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    fireEvent.click(screen.getByLabelText('Credential expirations'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [path, data] = updateDocMock.mock.calls[0]!;
    expect(path).toBe('operators/goldstar/users/att1');
    expect(data).toEqual({ notificationPrefs: { emailClaims: true, emailCredentials: true, pushRequests: true } });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Notification preferences saved.'));
  });

  it('a failed save is sanitized via toast.error', async () => {
    useDocMock.mockReturnValue({ data: USER, loading: false });
    updateDocMock.mockRejectedValue(new Error('PERMISSION_DENIED: internal detail'));
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    fireEvent.click(screen.getByLabelText('Credential expirations'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
  });

  it('Save re-disables after a successful save (no longer dirty)', async () => {
    useDocMock.mockReturnValue({ data: USER, loading: false });
    render(<NotificationPrefsForm operatorId="goldstar" uid="att1" />);
    fireEvent.click(screen.getByLabelText('Credential expirations'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save preferences' })).toBeDisabled());
  });
});
