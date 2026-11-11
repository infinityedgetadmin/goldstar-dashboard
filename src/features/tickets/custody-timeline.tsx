'use client';
import { formatInTimeZone } from 'date-fns-tz';
import type { CustodyEvent, User } from '@goldstar/platform';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';

const ACTION_LABEL: Record<CustodyEvent['action'], string> = {
  checked_in: 'Checked in',
  keys_stored: 'Keys stored',
  parked: 'Parked',
  keys_taken: 'Keys taken',
  moved: 'Moved',
  retrieved: 'Retrieved',
  staged: 'Staged',
  delivered: 'Delivered',
  keys_returned: 'Keys returned',
  pre_drive_inspection: 'Pre-drive inspection',
  post_drive_inspection: 'Post-drive inspection',
  handoff_to_chase: 'Handed off to chase',
  note: 'Note',
};

export interface CustodyTimelineProps {
  events: CustodyEvent[];
  staffByUid: Map<string, User>;
  timezone: string;
}

/** Chain-of-custody timeline: every hand-off event on the ticket, oldest first, with the acting
 * staff member's name (not just their uid) — per the brief's "custody timeline (actor names)". */
export function CustodyTimeline({ events, staffByUid, timezone }: CustodyTimelineProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Custody timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState title="No custody events yet" />
        ) : (
          <ol className="border-border space-y-4 border-l pl-4">
            {events.map((e) => (
              <li key={e.id} className="relative">
                <span className="bg-primary-500 absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full" aria-hidden />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text size="sm" weight="medium">
                    {ACTION_LABEL[e.action]}
                  </Text>
                  <Text size="xs" color="tertiary">
                    {formatInTimeZone(new Date(e.at), timezone, 'MMM d, h:mm:ss a')}
                  </Text>
                </div>
                <Text size="sm" color="secondary">
                  {staffByUid.get(e.actorUid)?.displayName ?? e.actorUid}
                  {(e.zoneId || e.spotLabel) && ` · ${[e.zoneId, e.spotLabel].filter(Boolean).join(' ')}`}
                </Text>
                {e.note && (
                  <Text size="xs" color="tertiary">
                    {e.note}
                  </Text>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
