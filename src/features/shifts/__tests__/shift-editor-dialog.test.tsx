import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shift } from '@goldstar/platform';

// Typed with explicit (unused) params, not `async () => {}` — `vi.fn(impl)` infers the mock's call
// signature from `impl` itself, and a zero-param impl would make `set(r.path, d)` below a real
// `tsc` arity error (caught by `npm run type-check`, this workspace's zero-tolerance gate).
const set = vi.fn(async (_path: string, _data: unknown) => {});
const update = vi.fn(async (_path: string, _data: unknown) => {});
const del = vi.fn(async (_path: string) => {});
// The given test (task-2-brief.md) only needs `doc`/`setDoc` wrapping `set`, plus a plain
// `updateDoc: vi.fn()`; `updateDoc` is rewired to route through a named `update` spy (still just a
// mock function, same as `vi.fn()` — the given test doesn't reference `updateDoc` at all, so this
// doesn't change its behavior) and `deleteDoc`/`deleteField` are added for this file's own edit/
// delete-mode tests. Given assertions are unchanged.
vi.mock('firebase/firestore', () => ({
  doc: (_d: unknown, p: string) => ({ path: p }),
  setDoc: (r: { path: string }, d: unknown) => set(r.path, d),
  updateDoc: (r: { path: string }, d: unknown) => update(r.path, d),
  deleteDoc: (r: { path: string }) => del(r.path),
  deleteField: () => '__deleteField__',
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));
// ShiftEditorDialog renders ClockAuditPanel/TipPoolPanel in edit mode, which live-subscribe via
// `useCollection` (`use-shifts.ts`) — stubbed here so this file's edit-mode tests don't need a real
// Firestore listener, matching `key-tags-panel.test.tsx`'s established mocking pattern.
vi.mock('@/lib/firebase/hooks', () => ({ useCollection: () => ({ data: [], loading: false, error: null }) }));
const correctClock = vi.fn(async () => ({ eventId: 'e1' }));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => correctClock }));

import { ShiftEditorDialog } from '../shift-editor-dialog';

const VENUE = { id: 'v1', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as never;
const ANA = { uid: 'att1', displayName: 'Ana', roles: ['attendant'], venueIds: ['v1'] } as never;
const BEN = { uid: 'att2', displayName: 'Ben', roles: ['driver'], venueIds: ['v1'] } as never;

function lastCall(mock: typeof set): [string, Record<string, unknown>] {
  return mock.mock.calls[mock.mock.calls.length - 1] as [string, Record<string, unknown>];
}

describe('ShiftEditorDialog', () => {
  beforeEach(() => {
    set.mockClear();
    update.mockClear();
    del.mockClear();
    correctClock.mockClear();
  });

  it('creates an internal shift with assignments', async () => {
    render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" />);
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '23:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() =>
      expect(set).toHaveBeenCalledWith(
        expect.stringMatching(/^operators\/goldstar\/shifts\//),
        expect.objectContaining({ venueId: 'v1', date: '2026-08-23', status: 'planned', source: { provider: 'internal' }, assignments: [expect.objectContaining({ uid: 'att1', role: 'attendant' })] }),
      ),
    );
  });

  it('denormalizes assignedUids from assignments[].uid in the SAME write — schema invariant mobile\'s myShifts (array-contains) query depends on', async () => {
    render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA, BEN]} date="2026-08-23" />);
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '23:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, payload] = lastCall(set);
    expect(payload.assignedUids).toEqual(['att1', 'att2']);
    expect((payload.assignments as { uid: string }[]).map((a) => a.uid)).toEqual(['att1', 'att2']);
  });

  it('an overnight shift (ends before starts, local wall-clock time) rolls the end onto the next calendar day — a forward-moving ~4h window, not backward', async () => {
    render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" />);
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '22:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '02:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, payload] = lastCall(set);
    const startsAt = new Date(payload.startsAt as string).getTime();
    const endsAt = new Date(payload.endsAt as string).getTime();
    expect(endsAt).toBeGreaterThan(startsAt);
    expect(endsAt - startsAt).toBe(4 * 60 * 60 * 1000);
  });

  it('equal start/end times are rejected with a validation error instead of silently creating a 24h shift (fix round 1, n2: task-2-review.md)', async () => {
    render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" />);
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '17:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    expect(await screen.findByText("Start and end can't be the same time")).toBeInTheDocument();
    expect(set).not.toHaveBeenCalled();
  });

  it('checking a person with a single role defaults their assignment to that role, unchecking removes them', async () => {
    render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA, BEN]} date="2026-08-23" />);
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '17:00' } });
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '23:00' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ana' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ben' })); // uncheck
    fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));
    await waitFor(() => expect(set).toHaveBeenCalled());
    const [, payload] = lastCall(set);
    expect(payload.assignments).toEqual([expect.objectContaining({ uid: 'att1', role: 'attendant' })]);
  });

  describe('edit mode — internal shift', () => {
    const internalShift: Shift = {
      id: 'shift1',
      operatorId: 'goldstar',
      venueId: 'v1',
      date: '2026-08-23',
      startsAt: '2026-08-23T21:00:00.000Z', // 17:00 America/Indiana/Indianapolis (EDT, UTC-4)
      endsAt: '2026-08-24T03:00:00.000Z', // 23:00 same day, local
      status: 'open',
      assignments: [{ uid: 'att1', role: 'attendant', startsAt: '2026-08-23T21:00:00.000Z', endsAt: '2026-08-24T03:00:00.000Z', confirmed: true }],
      notes: 'Bring extra radios',
      assignedUids: ['att1'],
      source: { provider: 'internal' },
    };

    it('pre-fills times in venue-local wall-clock and lets a manager change status/notes/lead', async () => {
      render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" shift={internalShift} />);

      expect(screen.getByLabelText('Starts')).toHaveValue('17:00');
      expect(screen.getByLabelText('Ends')).toHaveValue('23:00');

      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'closed' } });
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Closed early — rain' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      const [path, payload] = lastCall(update);
      expect(path).toBe('operators/goldstar/shifts/shift1');
      expect(payload).toMatchObject({ status: 'closed', notes: 'Closed early — rain' });
      // internal edit can still touch assignments/times — unlike the external-shift branch below.
      expect(payload.assignments).toEqual([expect.objectContaining({ uid: 'att1', role: 'attendant' })]);
    });

    it('an admin can delete an internal shift (two-step confirm)', async () => {
      const onOpenChange = vi.fn();
      render(<ShiftEditorDialog open onOpenChange={onOpenChange} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" shift={internalShift} canDelete />);

      fireEvent.click(screen.getByRole('button', { name: 'Delete shift' }));
      expect(del).not.toHaveBeenCalled(); // first click only arms the confirm — no delete yet
      fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

      await waitFor(() => expect(del).toHaveBeenCalledWith('operators/goldstar/shifts/shift1'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('does not show a delete button when canDelete is false (lead editing, not admin)', () => {
      render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" shift={internalShift} />);
      expect(screen.queryByRole('button', { name: 'Delete shift' })).not.toBeInTheDocument();
    });

    it('warns when an assignee is also on another loaded shift whose window overlaps this one', () => {
      const otherShift: Shift = { ...internalShift, id: 'shift2', startsAt: '2026-08-23T22:00:00.000Z', endsAt: '2026-08-24T04:00:00.000Z' };
      render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" shift={internalShift} existingShifts={[otherShift]} />);
      expect(screen.getByText(/Also on a shift/)).toBeInTheDocument();
    });
  });

  describe('edit mode — external (synced) shift', () => {
    const externalShift: Shift = {
      id: 'shift-ext',
      operatorId: 'goldstar',
      venueId: 'v1',
      date: '2026-08-23',
      startsAt: '2026-08-23T21:00:00.000Z',
      endsAt: '2026-08-24T03:00:00.000Z',
      status: 'open',
      assignments: [{ uid: 'att1', role: 'attendant', startsAt: '2026-08-23T21:00:00.000Z', endsAt: '2026-08-24T03:00:00.000Z', confirmed: true }],
      notes: '',
      assignedUids: ['att1'],
      source: { provider: 'when_i_work', externalId: 'ext-1' },
    };

    it('shows a "Synced" badge and disables times/assignments — only status/leadUid/notes are editable', async () => {
      render(<ShiftEditorDialog open onOpenChange={() => {}} operatorId="goldstar" venue={VENUE} staff={[ANA]} date="2026-08-23" shift={externalShift} />);

      expect(screen.getByText(/Synced from When I Work/)).toBeInTheDocument();
      expect(screen.getByLabelText('Starts')).toBeDisabled();
      expect(screen.getByLabelText('Ends')).toBeDisabled();
      expect(screen.getByRole('checkbox', { name: 'Ana' })).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'closed' } });
      fireEvent.change(screen.getByLabelText('Notes'), { target: { value: 'Confirmed via provider' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save shift' }));

      await waitFor(() => expect(update).toHaveBeenCalled());
      const [path, payload] = lastCall(update);
      expect(path).toBe('operators/goldstar/shifts/shift-ext');
      expect(payload).toEqual({ status: 'closed', notes: 'Confirmed via provider' });
      // Crucially: no startsAt/endsAt/assignments/assignedUids keys at all — external edit never
      // touches provider-owned fields, even though `updateDoc` alone would technically allow it.
      expect(payload).not.toHaveProperty('startsAt');
      expect(payload).not.toHaveProperty('assignments');
    });
  });
});
