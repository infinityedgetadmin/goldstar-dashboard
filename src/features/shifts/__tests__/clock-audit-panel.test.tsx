import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClockEvent, Shift } from '@goldstar/platform';

const useCollectionMock = vi.fn();
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: (...args: unknown[]) => useCollectionMock(...args) }));

const correctClock = vi.fn(async () => ({ eventId: 'corrected-1' }));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => correctClock }));

import { ClockAuditPanel, computeAssigneeAudit } from '../clock-audit-panel';

const TZ = 'America/Indiana/Indianapolis'; // EDT (UTC-4) in August

function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'shift1',
    operatorId: 'goldstar',
    venueId: 'v1',
    date: '2026-08-23',
    startsAt: '2026-08-23T21:00:00.000Z',
    endsAt: '2026-08-24T05:00:00.000Z',
    status: 'open',
    assignments: [{ uid: 'att1', role: 'attendant', startsAt: '2026-08-23T21:00:00.000Z', endsAt: '2026-08-24T05:00:00.000Z', confirmed: true }],
    notes: '',
    assignedUids: ['att1'],
    source: { provider: 'internal' },
    ...over,
  };
}

function event(over: Partial<ClockEvent>): ClockEvent {
  return { id: 'e1', uid: 'att1', type: 'in', at: '2026-08-23T21:00:00.000Z', deviceId: 'd1', ...over };
}

const STAFF_BY_UID = new Map([['att1', { displayName: 'Ana' }]]);

beforeEach(() => {
  useCollectionMock.mockReset();
  correctClock.mockClear();
});

describe('computeAssigneeAudit', () => {
  it('a matched in/out pair yields exact hours with no anomalies', () => {
    const out = computeAssigneeAudit(
      [
        { type: 'in', at: '2026-08-23T21:00:00.000Z' },
        { type: 'out', at: '2026-08-24T01:00:00.000Z' },
      ],
      '2026-08-24T05:00:00.000Z',
    );
    expect(out).toEqual({ hours: 4, breakMinutes: 0, anomalies: [] });
  });

  it('break_start/break_end are tracked separately and do NOT reduce worked hours (gross hours, matching tip-pool semantics) — fix round 1 M1, task-2-review.md: this test/name previously contradicted its own assertion', () => {
    const out = computeAssigneeAudit(
      [
        { type: 'in', at: '2026-08-23T21:00:00.000Z' },
        { type: 'break_start', at: '2026-08-23T22:00:00.000Z' },
        { type: 'break_end', at: '2026-08-23T22:30:00.000Z' },
        { type: 'out', at: '2026-08-24T01:00:00.000Z' },
      ],
      '2026-08-24T05:00:00.000Z',
    );
    expect(out.hours).toBe(4);
    expect(out.breakMinutes).toBe(30);
  });

  it('a missing "out" is capped at the shift end and flagged as an anomaly', () => {
    const out = computeAssigneeAudit([{ type: 'in', at: '2026-08-24T03:00:00.000Z' }], '2026-08-24T05:00:00.000Z');
    expect(out.hours).toBe(2);
    expect(out.anomalies).toContain('Missing clock-out');
  });

  it('an "out" with no preceding "in" is flagged and contributes zero time', () => {
    const out = computeAssigneeAudit([{ type: 'out', at: '2026-08-23T21:00:00.000Z' }], '2026-08-24T05:00:00.000Z');
    expect(out.hours).toBe(0);
    expect(out.anomalies).toContain('Clock-out with no matching clock-in');
  });

  it('flags over 12 hours clocked', () => {
    const out = computeAssigneeAudit(
      [
        { type: 'in', at: '2026-08-23T09:00:00.000Z' },
        { type: 'out', at: '2026-08-23T22:00:00.000Z' },
      ],
      '2026-08-24T05:00:00.000Z',
    );
    expect(out.hours).toBe(13);
    expect(out.anomalies).toContain('Over 12 hours clocked');
  });
});

describe('ClockAuditPanel', () => {
  it('shows the timeline and computed hours for an assignee with clock events', () => {
    useCollectionMock.mockReturnValue({
      data: [event({ id: 'e1', type: 'in', at: '2026-08-23T21:00:00.000Z' }), event({ id: 'e2', type: 'out', at: '2026-08-24T01:00:00.000Z' })],
      loading: false,
    });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift()} staffByUid={STAFF_BY_UID} timezone={TZ} />);

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText(/4\.00h worked/)).toBeInTheDocument();
    expect(screen.getByText('in')).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
  });

  it('shows an anomaly warning for a missing clock-out', () => {
    useCollectionMock.mockReturnValue({ data: [event({ id: 'e1', type: 'in', at: '2026-08-24T03:00:00.000Z' })], loading: false });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift()} staffByUid={STAFF_BY_UID} timezone={TZ} />);
    expect(screen.getByText('Missing clock-out')).toBeInTheDocument();
  });

  it('shows every assignee even one with zero clock events', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift({ assignedUids: ['att1', 'att2'] })} staffByUid={new Map([...STAFF_BY_UID, ['att2', { displayName: 'Ben' }]])} timezone={TZ} />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Ben')).toBeInTheDocument();
    expect(screen.getAllByText('No clock events.')).toHaveLength(2);
  });

  it('shows a placeholder when the shift has no assignees at all', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift({ assignedUids: [] })} staffByUid={STAFF_BY_UID} timezone={TZ} />);
    expect(screen.getByText('No one is assigned to this shift yet.')).toBeInTheDocument();
  });

  it('submits a correction via shiftsCorrectClock with the target uid, chosen type, venue-local time converted to UTC, and the reason as note', async () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift()} staffByUid={STAFF_BY_UID} timezone={TZ} />);

    fireEvent.change(screen.getByLabelText('Ana correction type'), { target: { value: 'out' } });
    fireEvent.change(screen.getByLabelText('Ana correction time'), { target: { value: '2026-08-24T01:00' } });
    fireEvent.change(screen.getByLabelText('Ana correction reason'), { target: { value: 'forgot to clock out' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add correction' }));

    await waitFor(() =>
      expect(correctClock).toHaveBeenCalledWith({
        shiftId: 'shift1',
        uid: 'att1',
        type: 'out',
        at: '2026-08-24T05:00:00.000Z', // 01:00 EDT (UTC-4) on 08-24 -> 05:00 UTC
        note: 'forgot to clock out',
      }),
    );
  });

  it('disables the correction submit button until both a time and a reason are entered', () => {
    useCollectionMock.mockReturnValue({ data: [], loading: false });
    render(<ClockAuditPanel operatorId="goldstar" shift={shift()} staffByUid={STAFF_BY_UID} timezone={TZ} />);
    expect(screen.getByRole('button', { name: 'Add correction' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ana correction time'), { target: { value: '2026-08-24T01:00' } });
    expect(screen.getByRole('button', { name: 'Add correction' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Ana correction reason'), { target: { value: 'late device sync' } });
    expect(screen.getByRole('button', { name: 'Add correction' })).not.toBeDisabled();
  });
});
