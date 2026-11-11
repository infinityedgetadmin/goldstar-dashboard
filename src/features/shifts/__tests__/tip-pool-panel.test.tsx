import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Shift } from '@goldstar/platform';
import { TipPoolPanel } from '../tip-pool-panel';

function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'shift1',
    operatorId: 'goldstar',
    venueId: 'v1',
    date: '2026-08-23',
    startsAt: '2026-08-23T21:00:00.000Z',
    endsAt: '2026-08-24T05:00:00.000Z',
    status: 'closed',
    assignments: [],
    notes: '',
    assignedUids: ['att1', 'att2'],
    source: { provider: 'internal' },
    ...over,
  };
}

const STAFF_BY_UID = new Map([
  ['att1', { displayName: 'Ana' }],
  ['att2', { displayName: 'Ben' }],
]);

describe('TipPoolPanel', () => {
  it('renders the total and each allocation with hours and amount when tipPool is present', () => {
    render(
      <TipPoolPanel
        shift={shift({ tipPool: { total: 9000, hoursByUid: { att1: 4, att2: 2 }, allocations: [{ uid: 'att1', amount: 6000 }, { uid: 'att2', amount: 3000 }] } })}
        staffByUid={STAFF_BY_UID}
      />,
    );
    expect(screen.getByText(/Total: \$90\.00/)).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/4\.00h · \$60\.00/)).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getByText(/2\.00h · \$30\.00/)).toBeInTheDocument();
  });

  it('shows a "closed, no pool" message for a closed shift with no tipPool (deliverer tip policy)', () => {
    render(<TipPoolPanel shift={shift({ status: 'closed', tipPool: undefined })} staffByUid={STAFF_BY_UID} />);
    expect(screen.getByText('This shift does not pool tips.')).toBeInTheDocument();
  });

  it('shows a "not yet closed" message for an open shift with no tipPool', () => {
    render(<TipPoolPanel shift={shift({ status: 'open', tipPool: undefined })} staffByUid={STAFF_BY_UID} />);
    expect(screen.getByText('Tip pool allocations appear once this shift is closed.')).toBeInTheDocument();
  });

  it('falls back to the raw uid when a payee is not in staffByUid', () => {
    render(<TipPoolPanel shift={shift({ tipPool: { total: 100, hoursByUid: { ghost: 1 }, allocations: [{ uid: 'ghost', amount: 100 }] } })} staffByUid={new Map()} />);
    expect(screen.getByText('ghost')).toBeInTheDocument();
  });
});
