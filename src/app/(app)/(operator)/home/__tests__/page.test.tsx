import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// F6 (final-review.md): operator home renders the first-run checklist (moved here from Settings)
// and role-filtered quick links; Settings link is owner-only, matching Ruling E-4a's nav gate.
// Sign-off micro-fix round: the checklist itself is now owner-only too — most of its items
// (3 of 7 link to the now owner-only /settings) and its Dismiss action (writes a non-branding
// operators/{op} field, owner/platform_admin only under firestore.rules) are dead ends for
// admin/lead.

let mockSession: {
  claims?: { operatorId: string; roles: string[] };
  operator?: { branding: { displayName: string } };
} = {};
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

vi.mock('@/features/settings/first-run-checklist', () => ({
  FirstRunChecklist: () => <div data-testid="first-run-checklist" />,
}));

import HomePage from '../page';

const OPERATOR = { branding: { displayName: 'St. Elmo Valet' } };

describe('HomePage (F6)', () => {
  it('owner: renders the welcome header, the first-run checklist, and all three quick links', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['owner'] }, operator: OPERATOR };
    render(<HomePage />);
    expect(screen.getByText(/welcome back to st\. elmo valet/i)).toBeInTheDocument();
    expect(screen.getByTestId('first-run-checklist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /venues/i })).toHaveAttribute('href', '/venues');
    expect(screen.getByRole('link', { name: /staff/i })).toHaveAttribute('href', '/staff');
    expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/settings');
  });

  it('admin: sees the welcome header and Venues/Staff quick links, but NO checklist and NO Settings link', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['admin'] }, operator: OPERATOR };
    render(<HomePage />);
    expect(screen.getByText(/welcome back to st\. elmo valet/i)).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /venues/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /staff/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('lead: sees the welcome header and Venues/Staff quick links, but NO checklist and NO Settings link', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['lead'] }, operator: OPERATOR };
    render(<HomePage />);
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /venues/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('platform_admin (no owner role of their own): quick links follow the same isOwner check — no checklist, no Settings link', () => {
    mockSession = { claims: { operatorId: 'op1', roles: ['platform_admin'] }, operator: OPERATOR };
    render(<HomePage />);
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('shows a loading state when session data is not yet available', () => {
    mockSession = {};
    render(<HomePage />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-checklist')).not.toBeInTheDocument();
  });
});
