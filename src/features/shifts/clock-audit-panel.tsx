'use client';
import { useMemo, useState } from 'react';
import { fromZonedTime } from 'date-fns-tz';
import { AlertTriangle } from 'lucide-react';
import type { ClockEvent, Shift } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { useShiftClockEvents } from './use-shifts';
import { formatVenueDateTime } from './time';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface ClockAuditPanelProps {
  operatorId: string;
  shift: Shift;
  staffByUid: Map<string, { displayName: string }>;
  timezone: string;
}

type ClockEventType = ClockEvent['type'];

export interface AssigneeAudit {
  hours: number;
  breakMinutes: number;
  anomalies: string[];
}

/**
 * Per-assignee computed hours/breaks/anomalies for display — a separate (deliberately duplicated,
 * not imported) computation from the platform repo's `computeClockedHours` (`tipPool.ts`): that one
 * is scoped to exactly what tip-pool allocation needs (gross in-to-out hours, no break accounting,
 * shift-end capping for a missing "out"); this one is scoped to what a HUMAN reviewing the audit
 * panel needs (break minutes shown separately, BOTH "missing out" and "clock-out with no matching
 * in" surfaced as distinct anomalies, a >12h flag). The two repos don't share a code layer this
 * would go in without a contracts version bump for ~20 lines of pure logic neither app can import
 * from the other anyway (Functions runs server-side TS, this is client-side) — disclosed judgment
 * call, not an oversight.
 */
export function computeAssigneeAudit(events: Pick<ClockEvent, 'type' | 'at'>[], shiftEndsAt: string): AssigneeAudit {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  let openInAt: string | null = null;
  let openBreakAt: string | null = null;
  let workedMs = 0;
  let breakMs = 0;
  const anomalies: string[] = [];
  for (const e of sorted) {
    if (e.type === 'in') {
      if (openInAt) anomalies.push('Clocked in again without clocking out first');
      openInAt = e.at;
    } else if (e.type === 'out') {
      if (openInAt) {
        workedMs += Math.max(0, Date.parse(e.at) - Date.parse(openInAt));
        openInAt = null;
      } else {
        anomalies.push('Clock-out with no matching clock-in');
      }
    } else if (e.type === 'break_start') {
      openBreakAt = e.at;
    } else if (e.type === 'break_end' && openBreakAt) {
      breakMs += Math.max(0, Date.parse(e.at) - Date.parse(openBreakAt));
      openBreakAt = null;
    }
  }
  if (openInAt) {
    anomalies.push('Missing clock-out');
    workedMs += Math.max(0, Date.parse(shiftEndsAt) - Date.parse(openInAt));
  }
  const hours = workedMs / 3_600_000;
  if (hours > 12) anomalies.push('Over 12 hours clocked');
  return { hours, breakMinutes: breakMs / 60_000, anomalies };
}

const CORRECTION_TYPE_OPTIONS: { value: ClockEventType; label: string }[] = [
  { value: 'in', label: 'Clock in' },
  { value: 'out', label: 'Clock out' },
  { value: 'break_start', label: 'Break start' },
  { value: 'break_end', label: 'Break end' },
];

interface Draft {
  type: ClockEventType;
  at: string;
  note: string;
}

const EMPTY_DRAFT: Draft = { type: 'out', at: '', note: '' };

/**
 * Per-shift clock timeline, computed hours/breaks, and anomaly flags for each assignee, with an
 * inline correction form wired to the `shiftsCorrectClock` callable. Every viewer who can reach this
 * panel (embedded in `ShiftEditorDialog`, itself only reachable through the `(operator)` shell's
 * lead-or-above gate — `OperatorGate` in `(operator)/layout.tsx`) already satisfies that callable's
 * own lead/admin/platform_admin check, so this doesn't gate the correction form separately — a
 * denial would come back from the callable itself (`toast.error`) rather than the UI hiding it.
 */
export function ClockAuditPanel({ operatorId, shift, staffByUid, timezone }: ClockAuditPanelProps) {
  const { data: events, loading } = useShiftClockEvents(operatorId, shift.id);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [submittingUid, setSubmittingUid] = useState<string | null>(null);

  const eventsByUid = useMemo(() => {
    const map = new Map<string, ClockEvent[]>();
    for (const uid of shift.assignedUids) map.set(uid, []);
    for (const e of events) {
      const arr = map.get(e.uid) ?? [];
      arr.push(e);
      map.set(e.uid, arr);
    }
    return map;
  }, [events, shift.assignedUids]);

  const draftFor = (uid: string): Draft => drafts[uid] ?? EMPTY_DRAFT;
  const patchDraft = (uid: string, patch: Partial<Draft>) => setDrafts((prev) => ({ ...prev, [uid]: { ...draftFor(uid), ...patch } }));

  const submitCorrection = async (uid: string) => {
    const draft = draftFor(uid);
    if (!draft.at || !draft.note.trim()) return;
    setSubmittingUid(uid);
    try {
      const at = fromZonedTime(`${draft.at}:00`, timezone).toISOString();
      await callable('shiftsCorrectClock')({ shiftId: shift.id, uid, type: draft.type, at, note: draft.note.trim() });
      toast.success('Correction recorded');
      setDrafts((prev) => ({ ...prev, [uid]: EMPTY_DRAFT }));
    } catch (e) {
      toast.error(e);
    } finally {
      setSubmittingUid(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clock audit</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {shift.assignedUids.length === 0 ? (
          <Text size="sm" color="tertiary">
            No one is assigned to this shift yet.
          </Text>
        ) : loading ? (
          <Text size="sm" color="tertiary">
            Loading clock events…
          </Text>
        ) : (
          shift.assignedUids.map((uid) => {
            const uidEvents = eventsByUid.get(uid) ?? [];
            const audit = computeAssigneeAudit(uidEvents, shift.endsAt);
            const draft = draftFor(uid);
            const name = staffByUid.get(uid)?.displayName ?? uid;
            return (
              <div key={uid} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="sm" weight="medium">
                    {name}
                  </Text>
                  <Text size="xs" color="tertiary">
                    {audit.hours.toFixed(2)}h worked{audit.breakMinutes > 0 ? ` · ${Math.round(audit.breakMinutes)}m break` : ''}
                  </Text>
                </div>

                {uidEvents.length === 0 ? (
                  <Text size="xs" color="tertiary">
                    No clock events.
                  </Text>
                ) : (
                  <ul className="space-y-1">
                    {[...uidEvents]
                      .sort((a, b) => a.at.localeCompare(b.at))
                      .map((e) => (
                        <li key={e.id} className="flex items-center gap-2 text-ui-xs text-text-secondary">
                          <span className="font-medium capitalize">{e.type.replace('_', ' ')}</span>
                          <span>{formatVenueDateTime(e.at, timezone)}</span>
                        </li>
                      ))}
                  </ul>
                )}

                {audit.anomalies.map((a) => (
                  <div key={a} className="flex items-center gap-1.5 text-ui-xs text-warning-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{a}</span>
                  </div>
                ))}

                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <Select
                    selectSize="sm"
                    label="Type"
                    aria-label={`${name} correction type`}
                    options={CORRECTION_TYPE_OPTIONS}
                    value={draft.type}
                    onChange={(e) => patchDraft(uid, { type: e.target.value as ClockEventType })}
                  />
                  <Input
                    inputSize="sm"
                    label="At"
                    type="datetime-local"
                    aria-label={`${name} correction time`}
                    value={draft.at}
                    onChange={(e) => patchDraft(uid, { at: e.target.value })}
                  />
                  <Input inputSize="sm" label="Reason" aria-label={`${name} correction reason`} value={draft.note} onChange={(e) => patchDraft(uid, { note: e.target.value })} />
                  <Button size="sm" variant="secondary" loading={submittingUid === uid} disabled={!draft.at || !draft.note.trim()} onClick={() => submitCorrection(uid)}>
                    Add correction
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
