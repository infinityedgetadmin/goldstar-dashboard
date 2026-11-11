import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Ticket, Transaction, Venue } from '@goldstar/platform';

const VENUE: Venue = { id: 'v1', operatorId: 'goldstar', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as unknown as Venue;

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'pi_1',
    operatorId: 'goldstar',
    venueId: 'v1',
    ticketId: '01912345-7abc-7def-8123-456789abcdef',
    provider: 'stripe',
    providerRef: 'pi_1',
    kind: 'charge',
    status: 'succeeded',
    base: 1500,
    tip: 300,
    tax: 105,
    fees: 0,
    total: 1905,
    currency: 'USD',
    method: 'web',
    at: '2026-08-23T19:00:00.000Z',
    refunds: [],
    ...over,
  } as unknown as Transaction;
}

function defaultTicket(): Ticket {
  return {
    id: '01912345-7abc-7def-8123-456789abcdef',
    operatorId: 'goldstar',
    venueId: 'v1',
    payment: { status: 'paid', base: 1500, tip: 300, tax: 105, fees: 0, total: 1905, currency: 'USD', billTo: 'guest' },
  } as unknown as Ticket;
}

// Reassigned to `undefined` by the M3 "missing ticket" test below to simulate an archived
// ticket's `useDoc` resolving `snap.exists() === false` — genuinely `let`, not `const`
// (task-6-review.md M2/M3): this is read AND reassigned across the suite, not initialized once.
let currentTicket: Ticket | undefined = defaultTicket();

const useDocMock = vi.fn((path: string | undefined) => (path ? { data: currentTicket, loading: false } : { data: undefined, loading: false }));
vi.mock('@/lib/firebase/hooks', () => ({
  useDoc: (...args: unknown[]) => useDocMock(...(args as [string | undefined])),
}));

const staffRefundMock = vi.fn();
vi.mock('@/lib/firebase/callables', () => ({ callable: () => staffRefundMock }));

import { TransactionsTable } from '../transactions-table';

const defaultProps = {
  venues: [VENUE],
  operatorId: 'goldstar',
  loading: false,
  hasSearched: true,
  hasMore: false,
  loadingMore: false,
  onLoadMore: vi.fn(),
  canRefund: true,
};

beforeEach(() => {
  useDocMock.mockClear();
  staffRefundMock.mockReset();
  currentTicket = defaultTicket();
});

describe('TransactionsTable', () => {
  it('before any search, shows a prompt instead of a table', () => {
    render(<TransactionsTable {...defaultProps} transactions={[]} hasSearched={false} />);
    expect(screen.getByText('Search for transactions')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders every brief-specified column with the right values for a row', () => {
    render(<TransactionsTable {...defaultProps} transactions={[tx()]} />);
    expect(screen.getByText('St. Elmo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '01912345' })).toHaveAttribute('href', '/tickets/01912345-7abc-7def-8123-456789abcdef');
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument(); // base
    expect(screen.getByText('$3.00')).toBeInTheDocument(); // tip
    expect(screen.getByText('$1.05')).toBeInTheDocument(); // tax
    expect(screen.getByText('$19.05')).toBeInTheDocument(); // total
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument(); // no refunds
  });

  it('shows a refund summary (count + total) when a transaction has refunds', () => {
    render(<TransactionsTable {...defaultProps} transactions={[tx({ refunds: [{ refundRef: 're_1', amount: 500, at: '2026-08-23T20:00:00.000Z', reason: 'requested_by_customer' }] })]} />);
    expect(screen.getByText('1 · $5.00')).toBeInTheDocument();
  });

  it('shows a "no results" empty state for a completed search with zero matches', () => {
    render(<TransactionsTable {...defaultProps} transactions={[]} hasSearched />);
    expect(screen.getByText('No transactions match')).toBeInTheDocument();
  });

  it('shows a loading state while searching', () => {
    render(<TransactionsTable {...defaultProps} transactions={[]} hasSearched loading />);
    expect(screen.getByText('Searching…')).toBeInTheDocument();
  });

  it('shows "Load more" only when hasMore is true, and it calls onLoadMore', () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<TransactionsTable {...defaultProps} transactions={[tx()]} hasMore={false} onLoadMore={onLoadMore} />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();

    rerender(<TransactionsTable {...defaultProps} transactions={[tx()]} hasMore onLoadMore={onLoadMore} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  describe('refund gating', () => {
    it('shows Refund for a succeeded charge, hides it for a refunded one', () => {
      render(<TransactionsTable {...defaultProps} transactions={[tx({ id: 'pi_ok', status: 'succeeded' }), tx({ id: 'pi_done', status: 'refunded' })]} />);
      expect(screen.getAllByRole('button', { name: 'Refund' })).toHaveLength(1);
    });

    it('hides Refund for a non-charge kind (e.g. a room_charge row) even if succeeded', () => {
      render(<TransactionsTable {...defaultProps} transactions={[tx({ kind: 'room_charge', status: 'succeeded' })]} />);
      expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    });

    it('hides every Refund action entirely when canRefund is false', () => {
      render(<TransactionsTable {...defaultProps} transactions={[tx()]} canRefund={false} />);
      expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument();
    });

    it('clicking Refund fetches the transaction\'s ticket and opens the reused RefundDialog', () => {
      render(<TransactionsTable {...defaultProps} transactions={[tx()]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
      expect(useDocMock).toHaveBeenCalledWith(`operators/goldstar/tickets/${currentTicket!.id}`);
      expect(screen.getByRole('button', { name: 'Submit refund' })).toBeInTheDocument();
      expect(screen.getByText(/Leave the amount blank for a full refund of \$19\.05/)).toBeInTheDocument();
    });

    it('M3: a missing ticket (e.g. archived past the 90-day cutoff) shows an explicit "Refund unavailable" dialog, not a silent dead end', async () => {
      currentTicket = undefined; // simulates useDoc resolving snap.exists() === false
      render(<TransactionsTable {...defaultProps} transactions={[tx()]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
      await waitFor(() => expect(screen.getByText('Refund unavailable')).toBeInTheDocument());
      expect(screen.getByText("Ticket archived — refunds for archived tickets aren't available yet.")).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Submit refund' })).not.toBeInTheDocument();

      // Two "Close" buttons exist: this dialog's own footer button and the Dialog primitive's
      // built-in X icon button (also accessibly named "Close") — the footer one is first in DOM order.
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]!);
      expect(screen.queryByText('Refund unavailable')).not.toBeInTheDocument();
    });

    it('submitting the refund dialog calls staffRefund with the ticket id', async () => {
      staffRefundMock.mockResolvedValue({ refundRef: 're_new' });
      render(<TransactionsTable {...defaultProps} transactions={[tx()]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
      fireEvent.change(screen.getByLabelText('Refund reason'), { target: { value: 'guest requested a refund' } });
      fireEvent.click(screen.getByRole('button', { name: 'Submit refund' }));
      await waitFor(() => expect(staffRefundMock).toHaveBeenCalledWith({ ticketId: currentTicket!.id, reason: 'guest requested a refund' }));
    });
  });
});
