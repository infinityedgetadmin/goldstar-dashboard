import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PayoutBatch, User } from '@goldstar/platform';
import { PayoutsTable } from '../payouts-table';
import type { PayoutRow } from '../use-payouts';

const STAFF: User = { uid: 'att1', operatorId: 'goldstar', displayName: 'Ana Torres' } as unknown as User;

function payoutRow(over: Partial<PayoutRow> = {}): PayoutRow {
  return { id: 'shift1', shiftId: 'shift1', uid: 'att1', amount: 500, currency: 'USD', status: 'pending', createdAt: '2026-08-23T19:00:00.000Z', ...over };
}

const defaultProps = {
  batches: [] as PayoutBatch[],
  batchesLoading: false,
  canViewBatches: true,
  payouts: [] as PayoutRow[],
  payoutsLoading: false,
  staffByUid: new Map([['att1', STAFF]]),
  isOwnPayoutsOnly: false,
};

describe('PayoutsTable', () => {
  it('renders an honest empty state for payout batches — none have ever been written (no Plan 8 batcher yet)', () => {
    render(<PayoutsTable {...defaultProps} />);
    expect(screen.getByText('No payout batches yet')).toBeInTheDocument();
  });

  it('hides the payout batches section entirely for a lead (canViewBatches false)', () => {
    render(<PayoutsTable {...defaultProps} canViewBatches={false} />);
    expect(screen.queryByText('Payout batches')).not.toBeInTheDocument();
  });

  it('renders a real payout batch when one exists', () => {
    const batch: PayoutBatch = {
      id: 'b1',
      operatorId: 'goldstar',
      period: '2026-08',
      totalTips: 5000,
      currency: 'USD',
      allocations: [{ uid: 'att1', amount: 5000, status: 'paid' }],
      createdAt: '2026-08-23T19:00:00.000Z',
      status: 'completed',
    };
    render(<PayoutsTable {...defaultProps} batches={[batch]} />);
    expect(screen.getByText('2026-08')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
  });

  it('an owner/admin view shows the Staff column and a name join', () => {
    render(<PayoutsTable {...defaultProps} payouts={[payoutRow()]} />);
    expect(screen.getByText('Individual payouts')).toBeInTheDocument();
    expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('a lead\'s own-payouts view omits the Staff column and titles the card "Your payouts"', () => {
    render(<PayoutsTable {...defaultProps} payouts={[payoutRow()]} isOwnPayoutsOnly canViewBatches={false} />);
    expect(screen.getByText('Your payouts')).toBeInTheDocument();
    expect(screen.queryByText('Staff')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no individual payouts yet', () => {
    render(<PayoutsTable {...defaultProps} />);
    expect(screen.getByText('No payouts yet')).toBeInTheDocument();
  });
});
