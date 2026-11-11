import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AuditLogEntry } from '@goldstar/platform';

const { auditQueryMock, toastMock } = vi.hoisted(() => ({
  auditQueryMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => auditQueryMock }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

import { useAuditQuery } from '../use-audit-query';

const ENTRY: AuditLogEntry = {
  id: '01912345-7abc-7def-8123-456789abcdef',
  actorUid: 'owner1',
  action: 'integrations.setSecret',
  target: 'twilio.authToken',
  before: null,
  after: null,
  at: '2026-08-23T21:00:00.000Z',
  requestId: 'req1',
};

beforeEach(() => {
  auditQueryMock.mockReset();
  toastMock.error.mockReset();
});

describe('useAuditQuery', () => {
  it('starts with no results and hasSearched false', () => {
    const { result } = renderHook(() => useAuditQuery());
    expect(result.current.entries).toEqual([]);
    expect(result.current.hasSearched).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  it('search populates entries and sets hasSearched/loading correctly', async () => {
    auditQueryMock.mockResolvedValue({ entries: [ENTRY] });
    const { result } = renderHook(() => useAuditQuery());

    await act(async () => {
      await result.current.search({ from: '2026-08-16T00:00:00.000Z', to: '2026-08-23T23:59:59.999Z', limit: 500 });
    });

    expect(auditQueryMock).toHaveBeenCalledWith({ from: '2026-08-16T00:00:00.000Z', to: '2026-08-23T23:59:59.999Z', limit: 500 });
    expect(result.current.entries).toEqual([ENTRY]);
    expect(result.current.hasSearched).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('a failed search clears entries and sanitizes the error via toast', async () => {
    auditQueryMock.mockRejectedValue(new Error('permission_denied: internal detail'));
    const { result } = renderHook(() => useAuditQuery());

    await act(async () => {
      await result.current.search({ from: 'x', to: 'y', limit: 500 });
    });

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(result.current.entries).toEqual([]);
    expect(result.current.hasSearched).toBe(true);
  });

  it('a second search replaces the first result set', async () => {
    auditQueryMock.mockResolvedValueOnce({ entries: [ENTRY] });
    auditQueryMock.mockResolvedValueOnce({ entries: [] });
    const { result } = renderHook(() => useAuditQuery());

    await act(async () => {
      await result.current.search({ from: 'x', to: 'y', limit: 500 });
    });
    expect(result.current.entries).toEqual([ENTRY]);

    await act(async () => {
      await result.current.search({ from: 'x', to: 'y', limit: 500, action: 'ticket.cancel' });
    });
    expect(result.current.entries).toEqual([]);
  });
});
