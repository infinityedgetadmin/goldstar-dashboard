'use client';
import type { CallableInput, CallableOutput, Transaction } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { useCursorSearch, type UseCursorSearchResult } from '@/lib/use-cursor-search';

export type TransactionSearchFilters = CallableInput<'paymentsSearch'>;

export type UseTransactionsSearchResult = Omit<UseCursorSearchResult<TransactionSearchFilters, Transaction>, 'rows'> & { transactions: Transaction[] };

const paymentsSearch = callable('paymentsSearch');
const getTransactions = (out: CallableOutput<'paymentsSearch'>): Transaction[] => out.transactions;

/**
 * Wraps the `paymentsSearch` callable (Task 6) with cursor-pagination state — mirrors
 * `use-tickets-search.ts`'s own wrapper over the same shared `useCursorSearch` machinery
 * (`src/lib/use-cursor-search.ts`).
 *
 * `paymentsSearch`'s installed contract input is `{ venueId?, from, to, status?, limit, cursor? }`
 * — no `method` filter (the task brief's own paraphrase mentioned one; the ACTUALLY-installed
 * `@goldstar/platform` v0.3.5 contract does not, verified directly against
 * `node_modules/@goldstar/platform/dist/index.d.ts` before writing this — the UI below is built to
 * the real contract, not the brief's summary; disclosed in task-6-report.md).
 */
export function useTransactionsSearch(): UseTransactionsSearchResult {
  const { rows: transactions, ...rest } = useCursorSearch(paymentsSearch, getTransactions);
  return { transactions, ...rest };
}
