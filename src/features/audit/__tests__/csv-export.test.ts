import { describe, expect, it } from 'vitest';
import type { AuditLogEntry, User } from '@goldstar/platform';
import { auditEntriesToCsv } from '../csv-export';

function entry(over: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: '01912345-7abc-7def-8123-456789abcdef',
    operatorId: 'goldstar',
    actorUid: 'owner1',
    action: 'integrations.setSecret',
    target: 'twilio.authToken',
    before: null,
    after: null,
    at: '2026-08-23T21:00:00.000Z',
    requestId: 'req1',
    ...over,
  };
}

const STAFF = new Map<string, User>([['owner1', { uid: 'owner1', displayName: 'Jamie Rivera' } as User]]);

describe('auditEntriesToCsv', () => {
  it('emits a header row followed by one row per entry', () => {
    const csv = auditEntriesToCsv([entry()], STAFF);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Date,Actor,Action,Target,Before,After');
    expect(lines).toHaveLength(2);
  });

  it('resolves the actor uid to a display name via the staff map', () => {
    const csv = auditEntriesToCsv([entry({ actorUid: 'owner1' })], STAFF);
    expect(csv).toContain('Jamie Rivera');
  });

  it('falls back to the raw uid when the actor is not in the staff map', () => {
    const csv = auditEntriesToCsv([entry({ actorUid: 'ghost-uid' })], STAFF);
    expect(csv).toContain('ghost-uid');
  });

  it('renders the literal actorUid "system" as "system", not a staff lookup', () => {
    const csv = auditEntriesToCsv([entry({ actorUid: 'system' })], STAFF);
    const rows = csv.split('\r\n');
    expect(rows[1]).toContain(',system,');
  });

  it('serializes before/after as JSON', () => {
    const csv = auditEntriesToCsv([entry({ before: { status: 'active' }, after: { status: 'suspended' } })], STAFF);
    expect(csv).toContain('{""status"":""active""}');
    expect(csv).toContain('{""status"":""suspended""}');
  });

  it('quotes a field containing a comma', () => {
    const csv = auditEntriesToCsv([entry({ target: 'venue,with,commas' })], STAFF);
    expect(csv).toContain('"venue,with,commas"');
  });

  it('returns just the header for an empty entries array', () => {
    expect(auditEntriesToCsv([], STAFF)).toBe('Date,Actor,Action,Target,Before,After');
  });
});
