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

let snapshotCb: ((s: { docs: { id: string; data: () => unknown }[] }) => void) | undefined;
let unsub: ReturnType<typeof vi.fn>;
let lastQuery: FakeQuery | undefined;

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ path }),
  where: (field: string, op: string, value: unknown): FakeWhere => ({ type: 'where', field, op, value }),
  query: (ref: { path: string }, ...constraints: FakeWhere[]): FakeQuery => ({ path: ref.path, constraints }),
  onSnapshot: (q: FakeQuery, onNext: (s: { docs: { id: string; data: () => unknown }[] }) => void) => {
    lastQuery = q;
    snapshotCb = onNext;
    unsub = vi.fn();
    return unsub;
  },
}));
vi.mock('@/lib/firebase/client', () => ({ firebase: () => ({ db: {} }) }));

import { useJobs } from '../use-jobs';

function job(id: string, jobType: Ticket['jobType'], status: Ticket['status'], requestedAt: string): { id: string; data: () => unknown } {
  return {
    id,
    data: () => ({
      operatorId: 'goldstar',
      venueId: 'v1',
      jobType,
      status,
      attendants: {},
      vehicle: {},
      flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
      times: { checkedInAt: '2026-08-23T20:00:00.000Z', requestedAt },
      guest: { phoneLast4: '0000', consentSms: false },
      damageReportIds: [],
      incidentIds: [],
      guestToken: 'x'.repeat(22),
      source: 'guest_web',
    }),
  };
}

function fire(docs: { id: string; data: () => unknown }[]) {
  snapshotCb?.({ docs });
}

beforeEach(() => {
  snapshotCb = undefined;
  lastQuery = undefined;
});

describe('useJobs', () => {
  it('returns an empty, non-loading result when operatorId is undefined', () => {
    const { result } = renderHook(() => useJobs(undefined));
    expect(result.current).toEqual({ jobs: [], loading: false });
  });

  it('queries operators/{operatorId}/tickets filtered to job types and active statuses, with no orderBy', () => {
    renderHook(() => useJobs('goldstar'));
    expect(lastQuery?.path).toBe('operators/goldstar/tickets');
    const jobTypeWhere = lastQuery?.constraints.find((c) => c.field === 'jobType');
    const statusWhere = lastQuery?.constraints.find((c) => c.field === 'status');
    expect(jobTypeWhere?.value).toEqual(['drive_home', 'passenger_ride']);
    expect(statusWhere?.op).toBe('in');
    // No orderBy constraint at all — see use-jobs.ts's own header comment: ordering by
    // times.assignedAt would exclude pre-assignment jobs (they have no such field yet).
    expect(lastQuery?.constraints.every((c) => c.type === 'where')).toBe(true);
  });

  it('sorts jobs oldest-times.requestedAt-first, including jobs with no times.assignedAt', async () => {
    const { result } = renderHook(() => useJobs('goldstar'));
    await act(async () => {
      fire([
        job('newer', 'passenger_ride', 'assigned', '2026-08-23T20:20:00.000Z'),
        job('older-unassigned', 'drive_home', 'requested', '2026-08-23T20:00:00.000Z'),
      ]);
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.jobs.map((j) => j.id)).toEqual(['older-unassigned', 'newer']);
  });

  it('unsubscribes on unmount', async () => {
    const { unmount } = renderHook(() => useJobs('goldstar'));
    await act(async () => {
      fire([]);
    });
    unmount();
    expect(unsub).toHaveBeenCalled();
  });
});
