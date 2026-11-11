import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Session } from '@/features/auth/session-provider';
import type { Invoice, Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';

vi.mock('firebase/firestore', () => ({
  where: (field: string, op: string, value: unknown) => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir: dir ?? 'asc' }),
  limit: (n: number) => ({ type: 'limit', n }),
}));

let mockData: Invoice[] = [];
let mockLoading = false;
let mockError: Error | null = null;
const useCollectionMock = vi.fn(() => ({ data: mockData, loading: mockLoading, error: mockError }));
vi.mock('@/lib/firebase/hooks', () => ({
  useCollection: (...args: unknown[]) => useCollectionMock(...(args as [])),
}));

let mockSession: Partial<Session> = {};
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

import { VenueInvoices } from '../venue-invoices';

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1' } as unknown as Venue;

function invoice(over: Partial<Invoice> & { id: string }): Invoice {
  return {
    operatorId: 'op1',
    venueId: 'v1',
    period: '2026-07',
    lines: [],
    subtotal: 120000,
    tax: 8400,
    total: 128400,
    currency: 'USD',
    status: 'sent',
    sentAt: '2026-08-01T12:00:00.000Z',
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Invoice;
}

function renderInvoices() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <VenueInvoices />
    </VenueProvider>
  );
}

beforeEach(() => {
  mockData = [];
  mockLoading = false;
  mockError = null;
  useCollectionMock.mockClear();
  mockSession = { claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 } } as unknown as Partial<Session>;
});

describe('VenueInvoices', () => {
  it('SECURITY: queries the registered invoicesByVenue shape, scoped to the claim-derived venue', () => {
    renderInvoices();
    expect(useCollectionMock).toHaveBeenCalledWith('operators/op1/invoices', [
      { type: 'where', field: 'venueId', op: '==', value: 'v1' },
      { type: 'orderBy', field: 'period', dir: 'desc' },
    ]);
  });

  it('renders period, formatted total, status and sent date', () => {
    mockData = [invoice({ id: 'i1' })];
    renderInvoices();

    expect(screen.getByText('2026-07')).toBeInTheDocument();
    expect(screen.getByText('$1,284.00')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
  });

  it('renders a dash for a draft that was never sent', () => {
    mockData = [invoice({ id: 'i1', status: 'draft', sentAt: undefined })];
    renderInvoices();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows an empty state when the venue has no invoices', () => {
    renderInvoices();
    expect(screen.getByText('No invoices yet')).toBeInTheDocument();
  });

  it('shows an error state when the listener fails', () => {
    mockError = new Error('permission-denied');
    renderInvoices();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('offers no PDF download anywhere (storage rules give a venue_user no readable path)', () => {
    mockData = [invoice({ id: 'i1', pdfPath: 'operators/op1/exports/i1.pdf' })];
    renderInvoices();
    expect(screen.queryByRole('link', { name: /pdf|download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pdf|download/i })).not.toBeInTheDocument();
  });
});
