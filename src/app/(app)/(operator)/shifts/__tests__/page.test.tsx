import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Venue } from '@goldstar/platform';

let mockSession: { claims?: { operatorId: string; roles: string[] }; isPlatformAdmin: boolean; operator?: { timezone: string } } = { isPlatformAdmin: false };
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

const useCollectionMock = vi.fn();
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: (...args: unknown[]) => useCollectionMock(...args) }));

// A rest-param impl (not `() => ({...})`) — `vi.fn(impl)` infers its call signature from `impl`
// itself, and a zero-param impl would make the `(...args: unknown[]) => useVenueShiftsMock(...args)`
// spread below a real `tsc` arity error.
const useVenueShiftsMock = vi.fn((..._args: unknown[]) => ({ data: [], loading: false, error: null }));
vi.mock('@/features/shifts/use-shifts', () => ({ useVenueShifts: (...args: unknown[]) => useVenueShiftsMock(...args) }));

vi.mock('@/features/shifts/shifts-calendar', () => ({ ShiftsCalendar: () => <div data-testid="shifts-calendar" /> }));
vi.mock('@/features/shifts/shift-editor-dialog', () => ({ ShiftEditorDialog: () => <div data-testid="shift-editor-dialog" /> }));

import ShiftsPage from '../page';
import { addDaysString } from '@/features/shifts/time';

function venue(over: Partial<Venue> = {}): Venue {
  return {
    id: 'v1',
    operatorId: 'op1',
    name: 'St. Elmo',
    type: 'restaurant',
    status: 'active',
    address: { line1: '1 Main St', city: 'Indianapolis', region: 'IN', postalCode: '46225', country: 'US' },
    geo: { lat: 39.76, lng: -86.16 },
    zones: [],
    rates: { valet: { model: 'flat', items: [], taxRateBps: 0, fees: [] }, driveHome: { base: 0, perMile: 0, perMinute: 0, minimum: 0 }, passengerRide: { base: 0, perMile: 0, perMinute: 0, minimum: 0 }, validations: { allowPartial: false, maxAmount: 0 } },
    sms: {},
    qr: { staticCheckoutEnabled: false },
    contract: { model: 'per_ticket', terms: '', billingEmail: '', invoiceDay: 1 },
    timezone: 'America/Indiana/Indianapolis',
    ...over,
  } as Venue;
}

describe('ShiftsPage', () => {
  beforeEach(() => {
    mockSession = { claims: { operatorId: 'op1', roles: ['owner'] }, isPlatformAdmin: false };
    useCollectionMock.mockReset();
    useVenueShiftsMock.mockReturnValue({ data: [], loading: false, error: null });
  });

  it('shows a loading state until the operatorId is resolved', () => {
    mockSession = { isPlatformAdmin: false };
    useCollectionMock.mockReturnValue({ data: [], loading: true, error: null });
    render(<ShiftsPage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('prompts to add a venue first when the operator has none', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false, error: null });
    render(<ShiftsPage />);
    expect(screen.getByText('Add a venue first — shifts are scheduled per venue.')).toBeInTheDocument();
  });

  it('renders the calendar and a venue selector once venues are loaded', () => {
    useCollectionMock.mockImplementation((path: string | undefined) => (path?.includes('/venues') ? { data: [venue()], loading: false, error: null } : { data: [], loading: false, error: null }));
    render(<ShiftsPage />);
    expect(screen.getByTestId('shifts-calendar')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Venue' })).toBeInTheDocument();
  });

  it('opens the shift editor dialog when "New shift" is clicked', () => {
    useCollectionMock.mockImplementation((path: string | undefined) => (path?.includes('/venues') ? { data: [venue()], loading: false, error: null } : { data: [], loading: false, error: null }));
    render(<ShiftsPage />);
    expect(screen.queryByTestId('shift-editor-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New shift/i }));
    expect(screen.getByTestId('shift-editor-dialog')).toBeInTheDocument();
  });

  it('paginates the visible week forward and backward', () => {
    useCollectionMock.mockImplementation((path: string | undefined) => (path?.includes('/venues') ? { data: [venue()], loading: false, error: null } : { data: [], loading: false, error: null }));
    render(<ShiftsPage />);
    const before = useVenueShiftsMock.mock.calls[useVenueShiftsMock.mock.calls.length - 1] as [string, string, string, string];
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    const after = useVenueShiftsMock.mock.calls[useVenueShiftsMock.mock.calls.length - 1] as [string, string, string, string];
    expect(after[2]).not.toBe(before[2]); // weekStart argument changed
  });

  describe('week range in a timezone west of UTC (owner-demo capture: header ended a day early)', () => {
    const originalTz = process.env.TZ;
    beforeEach(() => {
      // date-fns `format` reads the browser's local clock; west of UTC a UTC-midnight instant is
      // still the previous evening. Pinned here so the test fails the old code in any CI timezone.
      process.env.TZ = 'America/Indiana/Indianapolis';
      useCollectionMock.mockImplementation((path: string | undefined) =>
        path?.includes('/venues') ? { data: [venue()], loading: false, error: null } : { data: [], loading: false, error: null },
      );
    });
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    const lastWeek = () => useVenueShiftsMock.mock.calls[useVenueShiftsMock.mock.calls.length - 1] as [string, string, string, string];

    it('queries and labels Monday through Sunday of the same week', () => {
      render(<ShiftsPage />);
      const [, , weekStart, weekEnd] = lastWeek();
      expect(new Date(`${weekStart}T00:00:00Z`).getUTCDay()).toBe(1); // Monday
      expect(weekEnd).toBe(addDaysString(weekStart, 6)); // the Sunday the grid's last column shows
      expect(screen.getByText(`${weekStart} – ${weekEnd}`)).toBeInTheDocument();
    });

    it('moves exactly one week per click, staying on Mondays', () => {
      render(<ShiftsPage />);
      const [, , start] = lastWeek();
      fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
      expect(lastWeek()[2]).toBe(addDaysString(start, 7));
      fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
      fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
      expect(lastWeek()[2]).toBe(addDaysString(start, -7));
      expect(new Date(`${lastWeek()[2]}T00:00:00Z`).getUTCDay()).toBe(1);
    });
  });
});
