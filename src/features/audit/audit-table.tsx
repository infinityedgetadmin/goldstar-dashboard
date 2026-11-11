'use client';
import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { AuditLogEntry, User } from '@goldstar/platform';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/format';
import { diffAuditEntry } from './audit-diff';

export interface AuditTableProps {
  entries: AuditLogEntry[];
  staffByUid: Map<string, User>;
  loading: boolean;
  hasSearched: boolean;
}

function staffName(uid: string, staffByUid: Map<string, User>): string {
  if (uid === 'system') return 'System';
  return staffByUid.get(uid)?.displayName ?? uid;
}

/** Renders a diff leaf value compactly — `undefined`/missing as an em dash, everything else as
 * JSON (so a string still reads with its quotes, distinguishing `"0"` from the number `0`). */
function diffValue(v: unknown): string {
  return v === undefined ? '—' : JSON.stringify(v);
}

function DiffViewer({ before, after }: { before: unknown; after: unknown }) {
  const rows = diffAuditEntry(before, after);
  if (rows.length === 0) {
    return (
      <Text size="xs" color="tertiary">
        No field-level changes recorded.
      </Text>
    );
  }
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-ui-xs">
        <thead>
          <tr className="border-b border-border bg-bg-secondary text-left">
            <th className="px-3 py-1.5 font-medium text-text-secondary">Field</th>
            <th className="px-3 py-1.5 font-medium text-text-secondary">Before</th>
            <th className="px-3 py-1.5 font-medium text-text-secondary">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono">{r.key}</td>
              <td className="max-w-xs truncate px-3 py-1.5 font-mono text-text-tertiary" title={diffValue(r.before)}>
                {diffValue(r.before)}
              </td>
              <td className="max-w-xs truncate px-3 py-1.5 font-mono" title={diffValue(r.after)}>
                {diffValue(r.after)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Task 8 (task-89-report.md): audit log table with an expandable key-diff viewer per row. One row
 * per `AuditLogEntry` (`auditQuery`'s `entries`, already server-sorted `at desc`) — expanding a row
 * reveals `diffAuditEntry(before, after)`'s changed-field list, per the brief's "simple ... key-diff
 * list — no heavy dep" (see `audit-diff.ts`'s own header comment for the full reasoning).
 */
export function AuditTable({ entries, staffByUid, loading, hasSearched }: AuditTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading…
      </Text>
    );
  }

  if (!hasSearched) {
    return <EmptyState title="Search the audit log" description="Choose a date range above and click Search." />;
  }

  if (entries.length === 0) {
    return <EmptyState title="No audit entries" description="Nothing matched this date range and filter." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-hidden className="w-10" />
            <TableHead>Date</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => {
            const isOpen = expanded.has(e.id);
            return (
              <Fragment key={e.id}>
                <TableRow className="cursor-pointer" onClick={() => toggle(e.id)}>
                  <TableCell>
                    <button
                      type="button"
                      aria-label={isOpen ? `Collapse details for ${e.action}` : `Expand details for ${e.action}`}
                      aria-expanded={isOpen}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        toggle(e.id);
                      }}
                      className="flex h-11 w-11 items-center justify-center text-text-tertiary hover:text-text-primary"
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Text size="sm">{formatDateTime(e.at)}</Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm">{staffName(e.actorUid, staffByUid)}</Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" className="font-mono">
                      {e.action}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size="sm" color="tertiary" className="font-mono">
                      {e.target}
                    </Text>
                  </TableCell>
                </TableRow>
                {isOpen && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-bg-secondary">
                      <DiffViewer before={e.before} after={e.after} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
