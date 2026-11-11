import { describe, expect, it } from 'vitest';
import { diffAuditEntry } from '../audit-diff';

describe('diffAuditEntry', () => {
  it('returns one row per changed key between two plain objects', () => {
    const rows = diffAuditEntry({ status: 'active', name: 'Goldstar' }, { status: 'suspended', name: 'Goldstar' });
    expect(rows).toEqual([{ key: 'status', before: 'active', after: 'suspended' }]);
  });

  it('includes a key present in only one side (added or removed)', () => {
    const added = diffAuditEntry({ a: 1 }, { a: 1, b: 2 });
    expect(added).toEqual([{ key: 'b', before: undefined, after: 2 }]);

    const removed = diffAuditEntry({ a: 1, b: 2 }, { a: 1 });
    expect(removed).toEqual([{ key: 'b', before: 2, after: undefined }]);
  });

  it('returns an empty array when before and after are deeply equal', () => {
    expect(diffAuditEntry({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toEqual([]);
  });

  it('rows are sorted by key', () => {
    const rows = diffAuditEntry({ zeta: 1, alpha: 1 }, { zeta: 2, alpha: 2 });
    expect(rows.map((r) => r.key)).toEqual(['alpha', 'zeta']);
  });

  it('null before (e.g. a create event) diffs every key in after', () => {
    const rows = diffAuditEntry(null, { status: 'active' });
    expect(rows).toEqual([{ key: 'status', before: undefined, after: 'active' }]);
  });

  it('null after (e.g. a delete event) diffs every key in before', () => {
    const rows = diffAuditEntry({ status: 'active' }, null);
    expect(rows).toEqual([{ key: 'status', before: 'active', after: undefined }]);
  });

  it('both null (e.g. an action with no before/after payload) returns no rows', () => {
    expect(diffAuditEntry(null, null)).toEqual([]);
  });

  it('primitive before/after (not objects) falls back to a single synthetic "value" row when they differ', () => {
    expect(diffAuditEntry('active', 'suspended')).toEqual([{ key: 'value', before: 'active', after: 'suspended' }]);
  });

  it('equal primitive before/after returns no rows', () => {
    expect(diffAuditEntry('active', 'active')).toEqual([]);
  });

  it('a nested object VALUE that changed is not recursively diffed — the whole value is one row', () => {
    const rows = diffAuditEntry({ modules: { scheduling: { provider: 'internal' } } }, { modules: { scheduling: { provider: 'ical' } } });
    expect(rows).toEqual([{ key: 'modules', before: { scheduling: { provider: 'internal' } }, after: { scheduling: { provider: 'ical' } } }]);
  });

  it('an array value is compared by JSON equality, not treated as a plain object with numeric keys', () => {
    const rows = diffAuditEntry({ tags: ['a', 'b'] }, { tags: ['a', 'c'] });
    expect(rows).toEqual([{ key: 'tags', before: ['a', 'b'], after: ['a', 'c'] }]);
  });
});
