'use client';
import { useState } from 'react';
import type { User } from '@goldstar/platform';
import { Button } from '@/components/ui/buttons';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Text } from '@/components/ui/typography';
import { daysAgoLocal, endOfLocalDay, startOfLocalDay, todayLocal } from '@/lib/local-date-range';
import type { AuditQueryFilters } from './use-audit-query';

export interface AuditFiltersValue {
  from: string;
  to: string;
  action: string;
  actorUid: string;
}

export interface AuditFiltersProps {
  staff: User[];
  onSearch: (filters: AuditQueryFilters) => void;
}

/**
 * Task 8 (task-89-report.md): mirrors `payments/payments-filters.tsx` structurally. Built strictly
 * to `auditQuery`'s installed contract (`goldstar-platform`'s `src/callables.ts`): `{ from, to,
 * action?, actorUid?, limit }`, and the handler itself rejects passing BOTH `action` and `actorUid`
 * (`invalid_argument` — the underlying Firestore query would need a composite index that isn't
 * provisioned). Filtering by action is a free-text field (the contract has no `AUDIT_ACTIONS` enum
 * to build a `<Select>` from — every `audit()` call site names its own `action` string ad hoc, e.g.
 * `'integrations.setSecret'`); filtering by actor uses a `<Select>` over the operator's own staff
 * list (already fetched by the page, same convention as `payments-filters.tsx`'s venue picker).
 * Typing into one clears the other, keeping the UI itself unable to submit the combination the
 * server would reject.
 */
export function AuditFilters({ staff, onSearch }: AuditFiltersProps) {
  const [value, setValue] = useState<AuditFiltersValue>({
    from: daysAgoLocal(7),
    to: todayLocal(),
    action: '',
    actorUid: '',
  });

  const runSearch = (next: AuditFiltersValue) => {
    const filters: AuditQueryFilters = {
      from: startOfLocalDay(next.from),
      to: endOfLocalDay(next.to),
      ...(next.action ? { action: next.action } : {}),
      ...(next.actorUid ? { actorUid: next.actorUid } : {}),
      limit: 500,
    };
    onSearch(filters);
  };

  const update = <K extends keyof AuditFiltersValue>(key: K, v: AuditFiltersValue[K]) => {
    setValue((prev) => ({
      ...prev,
      [key]: v,
      ...(key === 'action' && v ? { actorUid: '' } : {}),
      ...(key === 'actorUid' && v ? { action: '' } : {}),
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(value);
  };

  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Audit log filters">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input type="date" label="From" value={value.from} onChange={(e) => update('from', e.target.value)} />
        <Input type="date" label="To" value={value.to} onChange={(e) => update('to', e.target.value)} />
        <Input
          label="Action"
          placeholder="e.g. integrations.setSecret"
          value={value.action}
          onChange={(e) => update('action', e.target.value)}
        />
        <Select
          label="Actor"
          value={value.actorUid}
          onChange={(e) => update('actorUid', e.target.value)}
          options={staff.map((u) => ({ value: u.uid, label: u.displayName || u.uid }))}
          placeholder="Any actor"
        />
      </div>
      {value.action && value.actorUid && (
        <Text size="xs" color="error">
          Action and actor can&apos;t be filtered together — clear one.
        </Text>
      )}
      <Button type="submit" disabled={Boolean(value.action && value.actorUid)}>
        Search
      </Button>
    </form>
  );
}
