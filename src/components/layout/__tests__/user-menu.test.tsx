import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { useSessionMock, pushMock, signOutMock, toastMock } = vi.hoisted(() => ({
  useSessionMock: vi.fn(),
  pushMock: vi.fn(),
  signOutMock: vi.fn(async () => {}),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/features/auth/use-session', () => ({ useSession: () => useSessionMock() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: { currentUser: { uid: 'att1' } } }) }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));
vi.mock('@/features/auth/mfa/enroll-totp-dialog', () => ({
  EnrollTotpDialog: (props: { open: boolean }) => (props.open ? <div data-testid="mfa-dialog" /> : null),
}));

import { UserMenu } from '../user-menu';

beforeEach(() => {
  pushMock.mockReset();
  signOutMock.mockReset().mockResolvedValue(undefined);
  toastMock.error.mockReset();
  useSessionMock.mockReset().mockReturnValue({ status: 'signed_in', email: 'owner@goldstarvalet.example.com', signOut: signOutMock });
});

// Radix's DropdownMenu opens on real pointer events, not a bare `fireEvent.click` — `userEvent`
// (already this codebase's convention for Radix-based dialogs, e.g. `enroll-totp-dialog.test.tsx`)
// dispatches the full pointerdown/pointerup/click sequence jsdom needs to actually open it.
async function openMenu() {
  const user = userEvent.setup();
  render(<UserMenu />);
  await user.click(screen.getByRole('button', { name: 'User menu' }));
  return user;
}

describe('UserMenu', () => {
  it('renders nothing when signed out', () => {
    useSessionMock.mockReturnValue({ status: 'signed_out' });
    const { container } = render(<UserMenu />);
    expect(container.firstChild).toBeNull();
  });

  it('opens to show the signed-in email and menu items', async () => {
    await openMenu();
    expect(screen.getByText('owner@goldstarvalet.example.com')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Two-factor authentication')).toBeInTheDocument();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });

  it('selecting Notifications navigates to /notifications', async () => {
    const user = await openMenu();
    await user.click(screen.getByText('Notifications'));
    expect(pushMock).toHaveBeenCalledWith('/notifications');
  });

  it('selecting Two-factor authentication opens the MFA enrollment dialog', async () => {
    const user = await openMenu();
    await user.click(screen.getByText('Two-factor authentication'));
    expect(screen.getByTestId('mfa-dialog')).toBeInTheDocument();
  });

  it('selecting Sign out calls session.signOut()', async () => {
    const user = await openMenu();
    await user.click(screen.getByText('Sign out'));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });

  it('a failed sign-out is reported via toast.error, not thrown to the UI', async () => {
    signOutMock.mockRejectedValue(new Error('network error: internal detail'));
    const user = await openMenu();
    await user.click(screen.getByText('Sign out'));
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
  });
});
