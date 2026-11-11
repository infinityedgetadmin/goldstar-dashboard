import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Home, Users } from 'lucide-react';
import type { Operator } from '@goldstar/platform';

vi.mock('next/navigation', () => ({
  usePathname: () => '/tickets',
  // Task 8/9 (task-89-report.md): `user-menu.tsx` (rendered inside `AppShell`) now also calls
  // `useRouter()` (its new "Notifications" menu item navigates via `router.push`) — this mock needs
  // to cover it too, or every test that mounts `AppShell` (and therefore `UserMenu`) throws.
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: { currentUser: null } }) }));
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => ({
    status: 'signed_in',
    uid: 'u1',
    email: 'owner@goldstar.example.com',
    isPlatformAdmin: false,
    assumedOperatorId: undefined,
    signOut: vi.fn(),
    assumeOperator: vi.fn(),
    leaveAssumed: vi.fn(),
    refreshClaims: vi.fn(),
  }),
}));

import { AppShell, visibleNavItems, type NavItem } from '../app-shell';

const operator = {
  id: 'goldstar',
  branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' },
  features: {
    driveHome: true,
    passengerRides: false,
    venuePortals: false,
    tapToPay: false,
    plateOcr: false,
    payouts: false,
  },
} as unknown as Operator;

const nav: NavItem[] = [
  { label: 'Home', href: '/home', icon: Home },
  { label: 'Staff', href: '/staff', icon: Users, roles: ['owner', 'admin'] },
  { label: 'Dispatch', href: '/dispatch', icon: Home, features: ['driveHome'] },
  { label: 'Payouts', href: '/payouts', icon: Home, features: ['payouts'] },
];

describe('visibleNavItems', () => {
  it('shows unrestricted items to any role', () => {
    const labels = visibleNavItems(nav, ['attendant'], operator).map((i) => i.label);
    expect(labels).toContain('Home');
  });

  it('hides role-restricted items when the current roles do not intersect', () => {
    const labels = visibleNavItems(nav, ['lead'], operator).map((i) => i.label);
    expect(labels).not.toContain('Staff');
  });

  it('shows role-restricted items when a current role matches', () => {
    const labels = visibleNavItems(nav, ['owner'], operator).map((i) => i.label);
    expect(labels).toContain('Staff');
  });

  it('lets platform_admin bypass role restrictions', () => {
    const labels = visibleNavItems(nav, ['platform_admin'], operator).map((i) => i.label);
    expect(labels).toContain('Staff');
  });

  it('hides feature-restricted items when the operator lacks every listed feature', () => {
    const labels = visibleNavItems(nav, ['owner'], operator).map((i) => i.label);
    expect(labels).not.toContain('Payouts');
  });

  it('shows feature-restricted items when the operator has a listed feature enabled', () => {
    const labels = visibleNavItems(nav, ['owner'], operator).map((i) => i.label);
    expect(labels).toContain('Dispatch');
  });

  it('hides feature-restricted items entirely when there is no operator yet', () => {
    const labels = visibleNavItems(nav, ['owner'], undefined).map((i) => i.label);
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Payouts');
  });
});

describe('AppShell', () => {
  it('renders only the gated nav items for the given roles', () => {
    render(
      <AppShell
        nav={[
          { label: 'Home', href: '/home', icon: Home },
          { label: 'Staff', href: '/staff', icon: Users, roles: ['owner'] },
        ]}
        roles={['attendant']}
        operator={operator}
      >
        <div>page content</div>
      </AppShell>
    );
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.queryByText('Staff')).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });

  it('applies the operator brand colors as CSS variables on the root', () => {
    const { container } = render(
      <AppShell nav={[]} roles={['owner']} operator={operator}>
        <div>content</div>
      </AppShell>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--color-primary-500')).toBe('#ab6034');
    expect(root.style.getPropertyValue('--color-accent-500')).toBe('#ffc30c');
  });

  it('renders default branding with no CSS variable overrides when there is no operator', () => {
    const { container, getByText } = render(
      <AppShell nav={[]} roles={['platform_admin']}>
        <div>content</div>
      </AppShell>
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--color-primary-500')).toBe('');
    expect(getByText('Goldstar Valet')).toBeInTheDocument();
  });
});
