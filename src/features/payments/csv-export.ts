import type { Transaction, Venue } from '@goldstar/platform';
import { formatMoney } from '@/lib/format';
import { venueName } from '@/features/tickets/ticket-format';

export { downloadCsv } from '@/lib/download-csv';

const HEADER = ['Date', 'Venue', 'Ticket', 'Method', 'Base', 'Tip', 'Tax', 'Total', 'Status', 'Refunds'];

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function refundsTotal(t: Transaction): string {
  if (t.refunds.length === 0) return '';
  return formatMoney(
    t.refunds.reduce((sum, r) => sum + r.amount, 0),
    t.currency,
  );
}

/** Builds a CSV string from the CURRENT (already-loaded) search results — no extra fetch, same
 * convention as `tickets/csv-export.ts`. Column order matches `transactions-table.tsx`. */
export function transactionsToCsv(transactions: Transaction[], venues: Venue[]): string {
  const rows = transactions.map((t) => [
    t.at,
    venueName(venues, t.venueId),
    t.ticketId,
    t.method,
    formatMoney(t.base, t.currency),
    formatMoney(t.tip, t.currency),
    formatMoney(t.tax, t.currency),
    formatMoney(t.total, t.currency),
    t.status,
    refundsTotal(t),
  ]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
