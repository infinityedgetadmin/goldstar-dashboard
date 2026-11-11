import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Operator, Role, Venue } from '@goldstar/platform';
import type { Session } from '@/features/auth/session-provider';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/venue',
}));

// `SessionProvider` would open real Firebase auth listeners; the gate under
// test reads `useSession()`, which is mocked below, so a pass-through is enough.
vi.mock('@/features/auth/session-provider', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// MFA enforcement has its own test suite (`features/auth/mfa`); here it only
// needs to not swallow the shell.
vi.mock('@/features/auth/mfa/mfa-enforcement-gate', () => ({
  MfaEnforcementGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ auth: { currentUser: null }, db: {} }) }));

let mockVenues: Venue[] = [];
let mockLoading = false;
const useClaimVenues = vi.fn(() => ({ venues: mockVenues, loading: mockLoading }));
vi.mock('@/features/venue/use-claim-venues', () => ({
  useClaimVenues: (...args: unknown[]) => useClaimVenues(...(args as [])),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import VenueLayout from '../layout';

function venue(id: string, name: string): Venue {
  return { id, name, operatorId: 'op1', type: 'restaurant', status: 'active' } as unknown as Venue;
}

/** A venue with a PMS configured — the only thing that puts "Hotel" in the nav. */
function hotelVenue(id: string, name: string): Venue {
  return {
    id,
    name,
    operatorId: 'op1',
    type: 'hotel',
    status: 'active',
    pms: { provider: 'opera_cloud', hotelId: 'h1', noPostBehavior: 'block', chargeCode: 'VLT' },
  } as unknown as Venue;
}

function makeOperator(venuePortals = true): Operator {
  return {
    id: 'op1',
    branding: { displayName: 'Goldstar Valet Co', primaryColor: '#ab6034', accentColor: '#ffc30c' },
    features: { driveHome: false, passengerRides: false, venuePortals, tapToPay: false, plateOcr: false, payouts: false },
  } as unknown as Operator;
}

const operator = makeOperator();

function session(over: Partial<Session> & { roles?: Role[] } = {}): Partial<Session> {
  const { roles = ['venue_user'] as Role[], ...rest } = over;
  return {
    status: 'signed_in',
    uid: 'u1',
    email: 'host@grill.example.com',
    isPlatformAdmin: roles.includes('platform_admin'),
    claims: { operatorId: 'op1', roles, venueIds: ['v1'], claimsVersion: 1 },
    operator,
    signOut: vi.fn(),
    assumeOperator: vi.fn(),
    leaveAssumed: vi.fn(),
    refreshClaims: vi.fn(),
    ...rest,
  };
}

beforeEach(() => {
  replace.mockClear();
  useClaimVenues.mockClear();
  window.localStorage.clear();
  mockVenues = [venue('v1', 'The Grill')];
  mockLoading = false;
  mockSession = session();
});

describe('VenueLayout: access gate', () => {
  it('renders the portal for a venue_user', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('venue page content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('renders the portal for a platform admin assuming the operator', async () => {
    mockSession = session({ roles: ['platform_admin', 'admin'] as Role[], assumedOperatorId: 'op1' });
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('venue page content')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends a signed-in user without venue_user to /no-access', async () => {
    mockSession = session({ roles: ['attendant'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
  });

  it('sends an operator manager without venue_user to /no-access', async () => {
    mockSession = session({ roles: ['owner'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
  });

  it('sends a session with no operator claim to /no-access', async () => {
    mockSession = session({ claims: { roles: ['venue_user'] as Role[], venueIds: ['v1'], claimsVersion: 1 } });
    render(<VenueLayout>venue page content</VenueLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
  });

  it('sends a signed-out visitor to /sign-in with a next param', async () => {
    mockSession = { status: 'signed_out', isPlatformAdmin: false };
    render(<VenueLayout>venue page content</VenueLayout>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in?next=%2Fvenue'));
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
  });

  it('shows only a skeleton while the session is still loading — no redirect yet', () => {
    mockSession = { status: 'loading', isPlatformAdmin: false };
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('SECURITY: never subscribes to venues for a session that failed the gate', () => {
    mockSession = session({ roles: ['attendant'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(useClaimVenues).not.toHaveBeenCalled();
  });

  it('SECURITY: scopes the venue subscription to the session claim, not a venue list', async () => {
    mockSession = session({ claims: { operatorId: 'op1', roles: ['venue_user'] as Role[], venueIds: ['v1', 'v2'], claimsVersion: 1 } });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(useClaimVenues).toHaveBeenCalledWith('op1', ['v1', 'v2']);
  });
});

describe('VenueLayout: shell chrome', () => {
  it('shows the six venue nav destinations', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    const nav = screen.getByRole('navigation', { name: /primary/i });

    for (const [label, href] of [
      ['Live board', '/venue'],
      ['Requests', '/venue/requests'],
      ['Validations', '/venue/validations'],
      ['Reports', '/venue/reports'],
      ['Invoices', '/venue/invoices'],
      ['Staffing', '/venue/staffing'],
    ] as const) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('does not show operator-only destinations', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Dispatch' })).not.toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('marks only Live board as the current page on /venue', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    const nav = screen.getByRole('navigation', { name: /primary/i });
    const current = within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page')
      .map((a) => a.textContent);
    expect(current).toEqual(['Live board']);
  });

  it("shows the operator's branding, not a per-venue name", async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(screen.getAllByText('Goldstar Valet Co').length).toBeGreaterThan(0);
  });

  it('hides the venue switcher for a single-venue host', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
  });

  it('SECURITY: shows exactly the two claimed venues for a two-venue host, and switching works', async () => {
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');

    const select = screen.getByRole('combobox', { name: /venue/i });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['The Grill', 'Rooftop']);
    expect(select).toHaveValue('v1');

    fireEvent.change(select, { target: { value: 'v2' } });
    expect(select).toHaveValue('v2');
  });

  it('shows a loading state instead of page content while venues resolve', () => {
    mockLoading = true;
    mockVenues = [];
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
  });

  it('shows a no-venue empty state instead of page content when the claim grants none', async () => {
    mockVenues = [];
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('No venue assigned')).toBeInTheDocument();
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
  });
});

describe('VenueLayout: operator.features.venuePortals gate', () => {
  it('renders the portal when the operator has venue portals enabled', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('venue page content')).toBeInTheDocument();
  });

  it('shows an explicit "not enabled" message when the flag is off — not page content', async () => {
    mockSession = session({ operator: makeOperator(false) });
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText("Venue portal isn't enabled")).toBeInTheDocument();
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
  });

  it('names the operator in the "not enabled" message so the host knows who to ask', async () => {
    mockSession = session({ operator: makeOperator(false) });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText("Venue portal isn't enabled");
    expect(screen.getByText(/Goldstar Valet Co hasn't turned on venue portals yet/)).toBeInTheDocument();
  });

  it('does NOT redirect to /no-access when the flag is off — a disabled feature is not an access failure', async () => {
    mockSession = session({ operator: makeOperator(false) });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText("Venue portal isn't enabled");
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps the shell chrome when the flag is off, so it reads as unconfigured rather than broken', async () => {
    mockSession = session({ operator: makeOperator(false) });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText("Venue portal isn't enabled");
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument();
    expect(screen.getAllByText('Goldstar Valet Co').length).toBeGreaterThan(0);
  });

  it('hides the venue switcher when the flag is off', async () => {
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    mockSession = session({ operator: makeOperator(false) });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText("Venue portal isn't enabled");
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
  });

  it('shows loading — never "not enabled" — while the operator document is still in flight', () => {
    mockSession = session({ operator: undefined });
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(screen.queryByText("Venue portal isn't enabled")).not.toBeInTheDocument();
    expect(screen.queryByText('venue page content')).not.toBeInTheDocument();
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0);
  });
});

describe('VenueLayout: no-venue empty states', () => {
  it('tells a venue_user with no assignment to ask their operator', async () => {
    mockVenues = [];
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('No venue assigned')).toBeInTheDocument();
    expect(screen.getByText(/Ask your valet operator to add you to one/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /operator dashboard/i })).not.toBeInTheDocument();
  });

  it('tells a platform admin plainly that platform admins have no venue assignments', async () => {
    mockVenues = [];
    mockSession = session({ roles: ['platform_admin', 'admin'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    expect(await screen.findByText('No venue assignments on this account')).toBeInTheDocument();
    expect(screen.getByText(/Platform admins aren't assigned to venues/)).toBeInTheDocument();
  });

  it('links a platform admin to the operator dashboard', async () => {
    mockVenues = [];
    mockSession = session({ roles: ['platform_admin', 'admin'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('No venue assignments on this account');
    expect(screen.getByRole('link', { name: /operator dashboard/i })).toHaveAttribute('href', '/home');
  });

  it('does not show the venue_user copy to a platform admin', async () => {
    mockVenues = [];
    mockSession = session({ roles: ['platform_admin', 'admin'] as Role[] });
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('No venue assignments on this account');
    expect(screen.queryByText('No venue assigned')).not.toBeInTheDocument();
  });
});

describe('VenueLayout: remembered venue selection', () => {
  const KEY = 'gs:venue:selected:u1';

  it('restores a previously selected venue on reload', async () => {
    window.localStorage.setItem(KEY, 'v2');
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(screen.getByRole('combobox', { name: /venue/i })).toHaveValue('v2');
  });

  it('persists the selection under a key scoped to this user', async () => {
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');

    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });

    expect(window.localStorage.getItem(KEY)).toBe('v2');
  });

  it('SECURITY: ignores a stored venue that is no longer in the claim', async () => {
    window.localStorage.setItem(KEY, 'v9-revoked');
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(screen.getByRole('combobox', { name: /venue/i })).toHaveValue('v1');
  });

  it("SECURITY: does not read another user's remembered venue", async () => {
    window.localStorage.setItem('gs:venue:selected:someone-else', 'v2');
    mockVenues = [venue('v1', 'The Grill'), venue('v2', 'Rooftop')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(screen.getByRole('combobox', { name: /venue/i })).toHaveValue('v1');
  });
});

/**
 * Per-VENUE nav (review M2). `VenueFrame` renders the shell from inside `VenueProvider` precisely
 * so `nav={venueNav(Boolean(venue?.pms))}` can see the SELECTED venue. `nav.test.ts` covers
 * `venueNav` as a pure function, which leaves the wiring unpinned: reverting that one prop back to
 * the constant `VENUE_NAV` passed the whole suite. These tests render the real layout and fail on
 * that revert.
 */
describe('VenueLayout: per-venue Hotel nav', () => {
  const navLinks = () =>
    within(screen.getByRole('navigation', { name: /primary/i }))
      .getAllByRole('link')
      .map((a) => a.textContent);

  it('does not offer Hotel to a venue with no PMS', async () => {
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(navLinks()).not.toContain('Hotel');
  });

  it('offers Hotel to a PMS venue, directly after Requests', async () => {
    mockVenues = [hotelVenue('v1', 'The Grand')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');

    const nav = screen.getByRole('navigation', { name: /primary/i });
    expect(within(nav).getByRole('link', { name: 'Hotel' })).toHaveAttribute('href', '/venue/hotel');
    expect(navLinks()).toEqual(['Live board', 'Requests', 'Hotel', 'Validations', 'Reports', 'Invoices', 'Staffing']);
  });

  it('SECURITY-adjacent: Hotel follows the SELECTED venue, appearing and disappearing on switch', async () => {
    // A two-venue host with one restaurant and one hotel. The tab is per-venue, not per-operator,
    // so it must track the switcher — this is the assertion the `venueNav` wiring exists for.
    mockVenues = [venue('v1', 'The Grill'), hotelVenue('v2', 'The Grand')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    expect(navLinks()).not.toContain('Hotel');

    const select = screen.getByRole('combobox', { name: /venue/i });
    fireEvent.change(select, { target: { value: 'v2' } });
    expect(navLinks()).toContain('Hotel');

    fireEvent.change(select, { target: { value: 'v1' } });
    expect(navLinks()).not.toContain('Hotel');
  });

  it('keeps every other destination unchanged when Hotel is added', async () => {
    mockVenues = [hotelVenue('v1', 'The Grand')];
    render(<VenueLayout>venue page content</VenueLayout>);
    await screen.findByText('venue page content');
    const nav = screen.getByRole('navigation', { name: /primary/i });

    for (const [label, href] of [
      ['Live board', '/venue'],
      ['Requests', '/venue/requests'],
      ['Validations', '/venue/validations'],
      ['Reports', '/venue/reports'],
      ['Invoices', '/venue/invoices'],
      ['Staffing', '/venue/staffing'],
    ] as const) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });
});
