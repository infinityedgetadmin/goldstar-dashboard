import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Ticket } from '@goldstar/platform';

interface FakeWhere {
  type: 'where';
  field: string;
  op: string;
  value: unknown;
}
interface FakeQuery {
  path: string;
  constraints: FakeWhere[];
}

const snapshotCbs: Record<string, (s: { docs: { id: string; data: () => unknown }[] }) => void> = {};
const unsubs: Record<string, ReturnType<typeof vi.fn>> = {};

/** Keys a query by `${venueId}:valet` / `${venueId}:job` (the valet group is the one whose
 * `status in [...]` list includes `'claimed'`) so a test can target one listener's callback. */
function groupKeyFor(q: FakeQuery): string {
  const venueWhere = q.constraints.find((c) => c.field === 'venueId');
  const statusWhere = q.constraints.find((c) => c.field === 'status');
  const venueId = venueWhere?.value as string;
  const statuses = statusWhere?.value as string[];
  return `${venueId}:${statuses.includes('claimed') ? 'valet' : 'job'}`;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  where: (field: string, op: string, value: unknown): FakeWhere => ({ type: 'where', field, op, value }),
  orderBy: (field: string, dir?: string) => ({ type: 'orderBy', field, dir }),
  query: (ref: { path: string }, ...constraints: FakeWhere[]): FakeQuery => ({ path: ref.path, constraints }),
  onSnapshot: (q: FakeQuery, onNext: (s: { docs: { id: string; data: () => unknown }[] }) => void) => {
    const key = groupKeyFor(q);
    snapshotCbs[key] = onNext;
    const unsub = vi.fn();
    unsubs[key] = unsub;
    return unsub;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { useLiveTickets } from '../use-live-tickets';

function ticket(id: string, venueId: string, status: Ticket['status'], requestedAt: string): { id: string; data: () => unknown } {
  return {
    id,
    data: () => ({
      operatorId: 'goldstar',
      venueId,
      jobType: 'valet',
      status,
      attendants: {},
      vehicle: {},
      flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
      times: { checkedInAt: '2026-08-23T20:00:00.000Z', requestedAt },
      guest: { phoneLast4: '0000', consentSms: false },
      damageReportIds: [],
      incidentIds: [],
      guestToken: 'x'.repeat(22),
      source: 'staff',
    }),
  };
}

function fireGroup(key: string, docs: { id: string; data: () => unknown }[]) {
  snapshotCbs[key]?.({ docs });
}

beforeEach(() => {
  Object.keys(snapshotCbs).forEach((k) => delete snapshotCbs[k]);
  Object.keys(unsubs).forEach((k) => delete unsubs[k]);
});

describe('useLiveTickets', () => {
  it('returns an empty, non-loading result when there are no venues', () => {
    const { result } = renderHook(() => useLiveTickets('goldstar', []));
    expect(result.current).toEqual({ ticketsByVenue: {}, loading: false });
  });

  it('groups tickets by venue, keeping each venue distinct', async () => {
    const { result } = renderHook(() => useLiveTickets('goldstar', ['v1', 'v2']));

    await act(async () => {
      fireGroup('v1:valet', [ticket('t1', 'v1', 'requested', '2026-08-23T20:10:00.000Z')]);
      fireGroup('v1:job', []);
      fireGroup('v2:valet', [ticket('t2', 'v2', 'claimed', '2026-08-23T20:05:00.000Z')]);
      fireGroup('v2:job', []);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ticketsByVenue.v1.map((t) => t.id)).toEqual(['t1']);
    expect(result.current.ticketsByVenue.v2.map((t) => t.id)).toEqual(['t2']);
  });

  it('sorts a venue’s tickets oldest-times.requestedAt-first, merging the valet and job groups', async () => {
    const { result } = renderHook(() => useLiveTickets('goldstar', ['v1']));

    await act(async () => {
      // valet group arrives with the NEWER of the two requests
      fireGroup('v1:valet', [ticket('newer', 'v1', 'claimed', '2026-08-23T20:20:00.000Z')]);
      // job group (drive_home/ride active statuses) arrives with the OLDER request
      fireGroup('v1:job', [ticket('older', 'v1', 'assigned', '2026-08-23T20:00:00.000Z')]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.ticketsByVenue.v1.map((t) => t.id)).toEqual(['older', 'newer']);
  });

  it('unsubscribes every listener (2 per venue) on unmount', async () => {
    const { unmount } = renderHook(() => useLiveTickets('goldstar', ['v1', 'v2']));
    await act(async () => {
      fireGroup('v1:valet', []);
      fireGroup('v1:job', []);
      fireGroup('v2:valet', []);
      fireGroup('v2:job', []);
    });
    unmount();
    expect(unsubs['v1:valet']).toHaveBeenCalled();
    expect(unsubs['v1:job']).toHaveBeenCalled();
    expect(unsubs['v2:valet']).toHaveBeenCalled();
    expect(unsubs['v2:job']).toHaveBeenCalled();
  });
});
