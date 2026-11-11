'use client';
import { useCallback, useState } from 'react';
import type { AuditLogEntry, CallableInput } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';

export type AuditQueryFilters = CallableInput<'auditQuery'>;

const auditQuery = callable('auditQuery');

export interface UseAuditQueryResult {
  entries: AuditLogEntry[];
  loading: boolean;
  hasSearched: boolean;
  /** Runs a fresh search, replacing any previously-loaded results. */
  search: (filters: AuditQueryFilters) => Promise<void>;
}

/**
 * Task 8 (task-89-report.md): wraps the `auditQuery` callable. Deliberately NOT built on
 * `useCursorSearch` (`src/lib/use-cursor-search.ts`) — that hook's `TOutput extends { nextCursor?:
 * string }` constraint doesn't fit: the installed `auditQuery` contract has no `cursor` input or
 * `nextCursor` output at all (`{ from, to, action?, actorUid?, limit }` -> `{ entries }`), capped at
 * `limit` (max 500) with no further pagination. A dedicated, simpler hook here rather than widening
 * the shared one for a shape it was never meant to support.
 */
export function useAuditQuery(): UseAuditQueryResult {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const search = useCallback(async (filters: AuditQueryFilters) => {
    setLoading(true);
    setHasSearched(true);
    try {
      const out = await auditQuery(filters);
      setEntries(out.entries);
    } catch (e) {
      toast.error(e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { entries, loading, hasSearched, search };
}
