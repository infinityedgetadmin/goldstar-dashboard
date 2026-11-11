import type { AuditLogEntry, User } from '@goldstar/platform';
import { formatDateTime } from '@/lib/format';

export { downloadCsv } from '@/lib/download-csv';

const HEADER = ['Date', 'Actor', 'Action', 'Target', 'Before', 'After'];

// Matches `tickets/csv-export.ts` and `payments/csv-export.ts`'s own identical 3-line `csvCell` —
// kept as its own small local copy rather than extracted a third time, same judgment call those two
// already made (their own header comments cross-reference each other as "same convention", never a
// shared import) — this one 4-line escaping helper isn't worth a new shared module for.
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function staffName(uid: string, staffByUid: Map<string, User>): string {
  return staffByUid.get(uid)?.displayName ?? uid;
}

/** Builds a CSV string from the CURRENT (already-loaded) search results — no extra fetch, same
 * convention as `tickets/csv-export.ts` / `payments/csv-export.ts`. `before`/`after` are JSON
 * stringified whole (not diffed) — the CSV is for external analysis/audit trail-keeping, not the
 * same "what changed" reading `audit-table.tsx`'s inline diff viewer gives. */
export function auditEntriesToCsv(entries: AuditLogEntry[], staffByUid: Map<string, User>): string {
  const rows = entries.map((e) => [
    formatDateTime(e.at),
    e.actorUid === 'system' ? 'system' : staffName(e.actorUid, staffByUid),
    e.action,
    e.target,
    JSON.stringify(e.before ?? null),
    JSON.stringify(e.after ?? null),
  ]);
  return [HEADER, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}
