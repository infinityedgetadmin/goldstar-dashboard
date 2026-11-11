import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Ruling E-4a (final-review F4): Settings is now owner-only — firestore.rules' operators/{op}
// update rule only widened to admit an admin's BRANDING-only write; every writer on this page
// (operator-settings-form, payments-settings, messaging-settings, scheduling-settings) touches
// non-branding fields, so admin/lead must be bounced to /no-access, not shown a page that
// 100%-fails every save. Mirrors mfa-enforcement-gate.test.tsx's mocking pattern: mock the child
// feature components out (their own behavior is covered by their own test files) so this file
// stays scoped to the page's OWN gate decision.

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

let mockSession: {
  status: 'loading' | 'signed_out' | 'signed_in';
  claims?: { operatorId: string; roles: string[] };
  operator?: { id: string };
  isPlatformAdmin: boolean;
} = { status: 'signed_in', isPlatformAdmin: false };
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

vi.mock('@/features/settings/operator-settings-form', () => ({ OperatorSettingsForm: () => <div data-testid="operator-settings-form" /> }));
vi.mock('@/features/settings/payments-settings', () => ({ PaymentsSettings: () => <div data-testid="payments-settings" /> }));
vi.mock('@/features/settings/messaging-settings', () => ({ MessagingSettings: () => <div data-testid="messaging-settings" /> }));
vi.mock('@/features/settings/scheduling-settings', () => ({ SchedulingSettings: () => <div data-testid="scheduling-settings" /> }));

import SettingsPage from '../page';

const OPERATOR = { id: 'op1', currency: 'USD' } as unknown as { id: string };

describe('SettingsPage (Ruling E-4a owner gate)', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('owner: renders the settings sections, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['owner'] }, operator: OPERATOR, isPlatformAdmin: false };
    render(<SettingsPage />);
    expect(await screen.findByTestId('operator-settings-form')).toBeInTheDocument();
    expect(screen.getByTestId('payments-settings')).toBeInTheDocument();
    expect(screen.getByTestId('messaging-settings')).toBeInTheDocument();
    expect(screen.getByTestId('scheduling-settings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home'); // F6: checklist-moved link
    expect(replace).not.toHaveBeenCalled();
  });

  it('platform_admin (no operatorId of their own required by the gate check): renders, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['platform_admin'] }, operator: OPERATOR, isPlatformAdmin: true };
    render(<SettingsPage />);
    expect(await screen.findByTestId('operator-settings-form')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('admin: redirected to /no-access, settings sections never render', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['admin'] }, operator: OPERATOR, isPlatformAdmin: false };
    await act(async () => {
      render(<SettingsPage />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByTestId('operator-settings-form')).not.toBeInTheDocument();
  });

  it('lead: redirected to /no-access, settings sections never render', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['lead'] }, operator: OPERATOR, isPlatformAdmin: false };
    await act(async () => {
      render(<SettingsPage />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByTestId('operator-settings-form')).not.toBeInTheDocument();
  });

  it('still loading (status not yet signed_in): no redirect fired, no sections rendered', () => {
    mockSession = { status: 'loading', isPlatformAdmin: false };
    render(<SettingsPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('operator-settings-form')).not.toBeInTheDocument();
  });
});
