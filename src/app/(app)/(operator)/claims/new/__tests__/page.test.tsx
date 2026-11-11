import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Final whole-branch review, final-wave item 14: a malformed `?ticketId=` (not a uuid) used to
// sail straight through to `useDoc` and land on a rendered `ClaimIntakeDialog` — an admin could
// fill out and submit a claim against a ticketId that could never be a real ticket. This page now
// validates the shape before ever mounting the dialog.

const replace = vi.fn();
const push = vi.fn();
let searchParamsValue = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  useSearchParams: () => searchParamsValue,
}));

let mockSession: {
  status: 'loading' | 'signed_out' | 'signed_in';
  claims?: { operatorId: string; roles: string[] };
  uid?: string;
} = { status: 'signed_in' };
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

let docOverride: { data: unknown; loading: boolean } = { data: undefined, loading: false };
vi.mock('@/lib/firebase/hooks', () => ({ useDoc: () => docOverride }));

vi.mock('@/features/claims/claim-intake-dialog', () => ({
  ClaimIntakeDialog: ({ ticketId }: { ticketId: string }) => <div data-testid="claim-intake-dialog">{ticketId}</div>,
}));

import NewClaimPage from '../page';

const VALID_TICKET_ID = '01912345-7abc-7def-8123-456789abcdef';

beforeEach(() => {
  replace.mockReset();
  push.mockReset();
  mockSession = { status: 'signed_in', claims: { operatorId: 'goldstar', roles: ['owner'] }, uid: 'admin1' };
  docOverride = { data: undefined, loading: false };
});

describe('NewClaimPage — ticketId validation (final-wave item 14)', () => {
  it('no ticketId at all: shows the "no ticket selected" empty state, no dialog', () => {
    searchParamsValue = new URLSearchParams();
    render(<NewClaimPage />);
    expect(screen.getByText('No ticket selected')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-intake-dialog')).not.toBeInTheDocument();
  });

  it.each(['not-a-uuid', '12345', '<script>alert(1)</script>', '01912345-7abc-7def-8123', ''])(
    'a malformed ticketId (%s) shows an honest "Invalid ticket" state, never mounts the dialog',
    (bad) => {
      searchParamsValue = new URLSearchParams(bad === '' ? { ticketId: '' } : { ticketId: bad });
      render(<NewClaimPage />);
      if (bad === '') {
        // An empty string is falsy -> the "no ticketId" branch, not "invalid" -- both are honest,
        // neither ever mounts the dialog.
        expect(screen.getByText('No ticket selected')).toBeInTheDocument();
      } else {
        expect(screen.getByText('Invalid ticket')).toBeInTheDocument();
      }
      expect(screen.queryByTestId('claim-intake-dialog')).not.toBeInTheDocument();
    },
  );

  it('a valid uuid ticketId proceeds past validation and mounts the dialog once loading settles', async () => {
    searchParamsValue = new URLSearchParams({ ticketId: VALID_TICKET_ID });
    docOverride = { data: { id: VALID_TICKET_ID, vehicle: {}, guest: {} }, loading: false };
    await act(async () => {
      render(<NewClaimPage />);
    });
    expect(screen.queryByText('Invalid ticket')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('claim-intake-dialog')).toHaveTextContent(VALID_TICKET_ID));
  });
});
