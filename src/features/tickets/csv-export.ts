import type { Ticket, User, Venue } from '@goldstar/platform';
import { formatMoney } from '@/lib/format';
import { STATUS_LABEL, ticketSummary } from '@/features/live/status-copy';
import { attendantName, retrievalLabel, venueName } from './ticket-format';

export { downloadCsv } from '@/lib/download-csv';

const HEADER = ['Time', 'Venue', 'Vehicle', 'Plate', 'Status', 'Attendant', 'Retrieval time', 'Payment', 'Tip'];

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Builds a CSV string from the CURRENT (already-loaded) search results — no extra fetch, per the
 * brief. Column order matches `tickets-table.tsx` exactly.
 */
export function ticketsToCsv(tickets: Ticket[], venues: Venue[], staffByUid: Map<string, User>): string {
  const rows = tickets.map((t) => [
    t.times.checkedInAt,
    venueName(venues, t.venueId),
    ticketSummary(t),
    t.vehicle.plate ?? '',
    STATUS_LABEL[t.status],
    attendantName(t, staffByUid),
    retrievalLabel(t),
    t.payment ? formatMoney(t.payment.total) : '',
    t.payment ? formatMoney(t.payment.tip) : '',
  ]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
