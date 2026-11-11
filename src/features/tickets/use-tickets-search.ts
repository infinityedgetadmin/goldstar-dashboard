'use client';
import type { CallableInput, CallableOutput, Ticket } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { useCursorSearch, type UseCursorSearchResult } from '@/lib/use-cursor-search';

export type TicketSearchFilters = CallableInput<'ticketsSearch'>;

export type UseTicketsSearchResult = Omit<UseCursorSearchResult<TicketSearchFilters, Ticket>, 'rows'> & { tickets: Ticket[] };

const ticketsSearch = callable('ticketsSearch');
const getTickets = (out: CallableOutput<'ticketsSearch'>): Ticket[] => out.tickets;

/**
 * Wraps the `ticketsSearch` callable with cursor-pagination state — see `use-cursor-search.ts`'s
 * `useCursorSearch` for the shared mechanics (extracted there in Task 6; this file's own public
 * API — `{ tickets, loading, loadingMore, hasSearched, hasMore, search, loadMore }` — is byte-for-
 * byte unchanged from before that refactor, so every existing caller/test needed no changes).
 */
export function useTicketsSearch(): UseTicketsSearchResult {
  const { rows: tickets, ...rest } = useCursorSearch(ticketsSearch, getTickets);
  return { tickets, ...rest };
}
