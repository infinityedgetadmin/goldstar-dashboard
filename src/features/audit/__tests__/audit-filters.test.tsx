import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { User } from '@goldstar/platform';
import { AuditFilters } from '../audit-filters';

const STAFF: User[] = [
  { uid: 'owner1', displayName: 'Jamie Rivera' } as User,
  { uid: 'admin1', displayName: 'Alex Chen' } as User,
];

const onSearch = vi.fn();

beforeEach(() => {
  onSearch.mockReset();
});

describe('AuditFilters', () => {
  it('submits a from/to range with no action/actorUid when neither is filled', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    const [filters] = onSearch.mock.calls[0] as [Record<string, unknown>];
    expect(filters.action).toBeUndefined();
    expect(filters.actorUid).toBeUndefined();
    expect(typeof filters.from).toBe('string');
    expect(typeof filters.to).toBe('string');
    expect(filters.limit).toBe(500);
  });

  it('typing an action includes it in the search', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'integrations.setSecret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const [filters] = onSearch.mock.calls[0] as [Record<string, unknown>];
    expect(filters.action).toBe('integrations.setSecret');
    expect(filters.actorUid).toBeUndefined();
  });

  it('selecting an actor includes their uid in the search', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'owner1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const [filters] = onSearch.mock.calls[0] as [Record<string, unknown>];
    expect(filters.actorUid).toBe('owner1');
    expect(filters.action).toBeUndefined();
  });

  it('typing an action clears a previously-selected actor (mutually exclusive)', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'owner1' } });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'ticket.cancel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const [filters] = onSearch.mock.calls[0] as [Record<string, unknown>];
    expect(filters.action).toBe('ticket.cancel');
    expect(filters.actorUid).toBeUndefined();
  });

  it('selecting an actor clears a previously-typed action (mutually exclusive)', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'ticket.cancel' } });
    fireEvent.change(screen.getByLabelText('Actor'), { target: { value: 'admin1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const [filters] = onSearch.mock.calls[0] as [Record<string, unknown>];
    expect(filters.actorUid).toBe('admin1');
    expect(filters.action).toBeUndefined();
  });

  it('changing the date range fields updates what gets submitted', () => {
    render(<AuditFilters staff={STAFF} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-01-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    // Compared via local Date fields, not an ISO-string prefix: `endOfLocalDay`/`startOfLocalDay`
    // anchor to the LOCAL calendar day, and `.toISOString()` always renders in UTC — a naive
    // string-prefix check is timezone-flaky (fails in any UTC-negative zone where 23:59:59 local
    // rolls into the next UTC calendar date).
    const [filters] = onSearch.mock.calls[0] as [{ from: string; to: string }];
    const from = new Date(filters.from);
    const to = new Date(filters.to);
    expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 0, 1]);
    expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 0, 31]);
    expect(to.getHours()).toBe(23);
    expect(to.getMinutes()).toBe(59);
  });
});
