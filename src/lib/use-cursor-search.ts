'use client';
import { useCallback, useRef, useState } from 'react';
import { toast } from '@/lib/toast';

const DEFAULT_PAGE_SIZE = 50;

export interface UseCursorSearchResult<TFilters, TRow> {
  rows: TRow[];
  loading: boolean;
  loadingMore: boolean;
  hasSearched: boolean;
  hasMore: boolean;
  /** Runs a fresh search, replacing any previously-loaded results. */
  search: (filters: TFilters) => Promise<void>;
  /** Fetches the next page (via the callable's `nextCursor`) for the last-run search, appending
   * to `rows`. No-op if there's no active search or no further pages. */
  loadMore: () => Promise<void>;
}

/**
 * Shared cursor-pagination state machine behind `useTicketsSearch` (Task 4) and
 * `useTransactionsSearch` (Task 6, `src/features/payments/use-transactions-search.ts`) — the two
 * callables' request/response shapes differ only in which field on the output carries the rows
 * (`tickets` vs `transactions`), which `run`/`getRows` factor out. Extracted here (DRY, per the
 * house rule — "before writing new logic, search for existing implementations") rather than
 * copy-pasting `use-tickets-search.ts`'s ~40 lines a second time for Task 6's payments explorer;
 * `use-tickets-search.ts` itself was refactored to a thin wrapper over this (its own public API —
 * `{ tickets, loading, loadingMore, hasSearched, hasMore, search, loadMore }` — is unchanged, so
 * its own tests and every existing caller needed no changes). Disclosed in task-6-report.md.
 *
 * Deliberately NOT an `onSnapshot` listener (mirrors `use-tickets-search.ts`'s own header comment)
 * — a search result is a one-shot query the user re-runs by changing filters, not a live feed.
 *
 * A "page" isn't guaranteed to add `pageSize` rows to the list — both backing callables
 * (`ticketsSearch`/`paymentsSearch`) bound their own raw Firestore fetch at `limit`, then filter
 * some of that in memory for whatever the base query's index doesn't cover; a page can come back
 * sparse (fewer rows than requested, sometimes zero) while `hasMore` still stays true. `hasMore`/
 * `loadMore` are still honest — no row is ever skipped or duplicated.
 */
export function useCursorSearch<TFilters extends Record<string, unknown>, TOutput extends { nextCursor?: string }, TRow>(
  run: (filters: TFilters & { limit: number }) => Promise<TOutput>,
  getRows: (out: TOutput) => TRow[],
  pageSize: number = DEFAULT_PAGE_SIZE,
): UseCursorSearchResult<TFilters, TRow> {
  const [rows, setRows] = useState<TRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const lastFilters = useRef<TFilters | undefined>(undefined);

  const search = useCallback(
    async (filters: TFilters) => {
      lastFilters.current = filters;
      setLoading(true);
      setHasSearched(true);
      try {
        const out = await run({ ...filters, limit: pageSize } as TFilters & { limit: number });
        setRows(getRows(out));
        setCursor(out.nextCursor);
      } catch (e) {
        toast.error(e);
        setRows([]);
        setCursor(undefined);
      } finally {
        setLoading(false);
      }
    },
    [run, getRows, pageSize],
  );

  const loadMore = useCallback(async () => {
    if (!lastFilters.current || !cursor) return;
    setLoadingMore(true);
    try {
      const out = await run({ ...lastFilters.current, limit: pageSize, cursor } as TFilters & { limit: number });
      setRows((prev) => [...prev, ...getRows(out)]);
      setCursor(out.nextCursor);
    } catch (e) {
      toast.error(e);
    } finally {
      setLoadingMore(false);
    }
  }, [run, getRows, pageSize, cursor]);

  return { rows, loading, loadingMore, hasSearched, hasMore: cursor !== undefined, search, loadMore };
}
