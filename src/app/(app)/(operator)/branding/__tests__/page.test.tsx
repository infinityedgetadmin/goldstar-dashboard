import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Sign-off micro-fix round (final-review.md "Re-review (final wave)"): Branding is admin+
// (owner/admin) per firestore.rules' operators/{op} update rule — never lead. Same page-gate
// pattern/test shape as venues/new/__tests__/page.test.tsx.

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

let mockSession: {
  status: 'loading' | 'signed_out' | 'signed_in';
  claims?: { operatorId: string; roles: string[] };
  isPlatformAdmin: boolean;
} = { status: 'signed_in', isPlatformAdmin: false };
vi.mock('@/features/auth/use-session', () => ({
  useSession: () => mockSession,
}));

vi.mock('@/features/branding/branding-editor', () => ({ BrandingEditor: () => <div data-testid="branding-editor" /> }));

import BrandingPage from '../page';

describe('BrandingPage (sign-off micro-fix: admin+ gate)', () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it('owner: renders the branding editor, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['owner'] }, isPlatformAdmin: false };
    render(<BrandingPage />);
    expect(await screen.findByTestId('branding-editor')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('admin: renders the branding editor, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['admin'] }, isPlatformAdmin: false };
    render(<BrandingPage />);
    expect(await screen.findByTestId('branding-editor')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('platform_admin: renders the branding editor, no redirect', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['platform_admin'] }, isPlatformAdmin: true };
    render(<BrandingPage />);
    expect(await screen.findByTestId('branding-editor')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('lead: redirected to /no-access, editor never renders', async () => {
    mockSession = { status: 'signed_in', claims: { operatorId: 'op1', roles: ['lead'] }, isPlatformAdmin: false };
    await act(async () => {
      render(<BrandingPage />);
    });
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/no-access'));
    expect(screen.queryByTestId('branding-editor')).not.toBeInTheDocument();
  });

  it('still loading (status not yet signed_in): no redirect fired, editor not rendered', () => {
    mockSession = { status: 'loading', isPlatformAdmin: false };
    render(<BrandingPage />);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId('branding-editor')).not.toBeInTheDocument();
  });
});
