import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// final-review.md F4: venue create is isAdmin+ (owner/admin) per firestore.rules — a lead reaching
// this page directly (the (operator) shell only requires MANAGER_ROLES) must be bounced to
// /no-access, not shown a form whose create() would just get denied on submit.

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

let mockSession: {
  status: 'loading' | 'signed_out' | 'signed_in';
  claims?: { operatorId: string; roles: string[] };
  operator?: { currency: string };
  isPlatformAdmin: boolean;
} = { status: 'signed_in', isPlatformAdmin: false };
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

vi.mock('@/features/venues/venue-form', () => ({ VenueForm: () => <div data-testid="venue-form" /> }));

import NewVenuePage from '../page';

const OPERATOR = { currency: 'USD' };

describe('NewVenuePage (final-review F4 admin+ gate)', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('owner: renders the venue form, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['owner'] }, operator: OPERATOR, isPlatformAdmin: false };
    render(<NewVenuePage />);
    expect(await screen.findByTestId('venue-form')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('admin: renders the venue form, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['admin'] }, operator: OPERATOR, isPlatformAdmin: false };
    render(<NewVenuePage />);
    expect(await screen.findByTestId('venue-form')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('platform_admin: renders the venue form, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['platform_admin'] }, operator: OPERATOR, isPlatformAdmin: true };
    render(<NewVenuePage />);
    expect(await screen.findByTestId('venue-form')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('lead: redirected to /no-access, form never renders', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['lead'] }, operator: OPERATOR, isPlatformAdmin: false };
    await act(async () => {
      render(<NewVenuePage />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByTestId('venue-form')).not.toBeInTheDocument();
  });
});
