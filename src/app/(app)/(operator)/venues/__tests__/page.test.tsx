import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// final-review.md F4: the "New venue" action links to a page that's now admin+-gated
// (venues/new's own page.tsx) — hidden here for a lead so the sidebar doesn't offer a dead click.

let mockSession: { claims?: { operatorId: string; roles: string[] }; isPlatformAdmin: boolean } = { isPlatformAdmin: false };
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

vi.mock('@/features/venues/venues-table', () => ({ VenuesTable: () => <div data-testid="venues-table" /> }));

import VenuesPage from '../page';

describe('VenuesPage: "New venue" action visibility (final-review F4)', () => {
  it('owner: sees the New venue action', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['owner'] }, isPlatformAdmin: false };
    render(<VenuesPage />);
    expect(screen.getByRole('link', { name: /new venue/i })).toBeInTheDocument();
  });

  it('admin: sees the New venue action', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['admin'] }, isPlatformAdmin: false };
    render(<VenuesPage />);
    expect(screen.getByRole('link', { name: /new venue/i })).toBeInTheDocument();
  });

  it('lead: the New venue action is hidden', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['lead'] }, isPlatformAdmin: false };
    render(<VenuesPage />);
    expect(screen.queryByRole('link', { name: /new venue/i })).not.toBeInTheDocument();
  });

  it('platform_admin: sees the New venue action', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['platform_admin'] }, isPlatformAdmin: true };
    render(<VenuesPage />);
    expect(screen.getByRole('link', { name: /new venue/i })).toBeInTheDocument();
  });
});
