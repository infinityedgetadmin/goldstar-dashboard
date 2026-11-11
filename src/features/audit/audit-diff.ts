/** One changed key between an audit entry's `before` and `after` values. `before`/`after` here are
 * the LEAF values (already JSON-safe — `AuditLogEntry.before`/`.after` are `z.unknown()`, whatever
 * shape the writer passed to `audit()`), not yet stringified for display. */
export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Task 8 (task-89-report.md): key-diff (not full side-by-side JSON) between `before`/`after`, per
 * the brief's own "simple side-by-side or key-diff list — no heavy dep" — no diff library pulled
 * in, just a shallow key comparison.
 *
 * Only top-level keys are compared — a changed key's VALUE is rendered as its own JSON blob
 * (`audit-table.tsx`), not recursively diffed. Every real audit writer in `goldstar-platform`
 * (`functions/src/lib/audit.ts`'s call sites) passes flat-ish before/after objects (e.g. a ticket's
 * `status`, an operator's `modules.scheduling.provider`), so a shallow diff already surfaces the
 * change; a nested-object value that itself changed shows as "before: {...}, after: {...}" rather
 * than a further per-field breakdown — a deliberate, disclosed simplification rather than a full
 * recursive JSON-diff implementation.
 *
 * `before`/`after` that aren't both plain objects (either is `null`, a primitive, or an array) fall
 * back to a single synthetic `'value'` row rather than attempting a key-by-key diff of something
 * that has no keys — every `audit()` call site that logs a primitive (e.g. a status enum) hits this
 * path.
 */
export function diffAuditEntry(before: unknown, after: unknown): DiffRow[] {
  if (!isPlainObject(before) && !isPlainObject(after)) {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ key: 'value', before, after }];
  }
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].sort();
  return keys
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, before: b[k], after: a[k] }));
}
