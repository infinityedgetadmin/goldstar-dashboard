'use client';
import { useMemo, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Shift, User, Venue } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { useCollection } from '@/lib/firebase/hooks';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { Select } from '@/components/ui/forms/Select';
import { Text } from '@/components/ui/typography';
import { ShiftsCalendar } from '@/features/shifts/shifts-calendar';
import { ShiftEditorDialog } from '@/features/shifts/shift-editor-dialog';
import { useVenueShifts } from '@/features/shifts/use-shifts';
import { addDaysString } from '@/features/shifts/time';

// Fallback only for a venue with no `timezone` set yet (the field is optional on `venueSchema`) and
// no operator-level default either — Goldstar's own HQ timezone, same fallback `seedOperator`/other
// fixtures in the platform repo use for this operator.
const DEFAULT_TIMEZONE = 'America/Indiana/Indianapolis';

export default function ShiftsPage() {
  const session = useSession();
  const operatorId = session.claims?.operatorId;
  const canDelete = session.isPlatformAdmin || (session.claims?.roles.some((r) => r === 'owner' || r === 'admin') ?? false);

  const { data: venues } = useCollection<Venue>(operatorId ? `operators/${operatorId}/venues` : undefined);
  const { data: staffDocs } = useCollection<User>(operatorId ? `operators/${operatorId}/users` : undefined);

  const [venueId, setVenueId] = useState('');
  const [weekStart, setWeekStart] = useState(() => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [dialog, setDialog] = useState<{ shift?: Shift; date: string } | null>(null);

  const venue = venues.find((v) => v.id === venueId) ?? venues[0];
  // Calendar-date math via `addDaysString` (UTC-anchored, like the grid's own columns). The old
  // `format(addDays(new Date('…T00:00:00Z'), n))` read the browser's local clock, so west of UTC the
  // week ended on Saturday (dropping Sunday's shifts from the query) and each Next/Previous click
  // drifted a day.
  const weekEnd = addDaysString(weekStart, 6);

  const { data: shifts } = useVenueShifts(operatorId, venue?.id, weekStart, weekEnd);

  // Only active staff are offered as assignable — an invited-but-not-yet-accepted or suspended
  // account shouldn't be pickable for a shift they can't actually clock into.
  const staff = useMemo(
    () => staffDocs.filter((u) => u.status === 'active').map((u) => ({ uid: u.uid, displayName: u.displayName, roles: u.roles, venueIds: u.venueIds })),
    [staffDocs],
  );
  const staffByUid = useMemo(() => new Map(staffDocs.map((u) => [u.uid, { displayName: u.displayName }])), [staffDocs]);
  const venueOptions = useMemo(() => venues.map((v) => ({ value: v.id, label: v.name })), [venues]);
  const timezone = venue?.timezone ?? session.operator?.timezone ?? DEFAULT_TIMEZONE;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shifts"
        description="Calendar, assignments, clock audit, and tip pools per venue."
        actions={
          venue ? (
            <Button icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={() => setDialog({ date: format(new Date(), 'yyyy-MM-dd') })}>
              New shift
            </Button>
          ) : undefined
        }
      />

      {!operatorId ? (
        <Text size="sm" color="tertiary">
          Loading…
        </Text>
      ) : venues.length === 0 ? (
        <Text size="sm" color="tertiary">
          Add a venue first — shifts are scheduled per venue.
        </Text>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Select selectSize="sm" aria-label="Venue" options={venueOptions} value={venue?.id ?? ''} onChange={(e) => setVenueId(e.target.value)} />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" aria-label="Previous week" onClick={() => setWeekStart((w) => addDaysString(w, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Text size="sm">
                {weekStart} – {weekEnd}
              </Text>
              <Button variant="ghost" size="sm" aria-label="Next week" onClick={() => setWeekStart((w) => addDaysString(w, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {venue && (
            <ShiftsCalendar
              weekStart={weekStart}
              timezone={timezone}
              shifts={shifts}
              staffByUid={staffByUid}
              onSelectShift={(shift) => setDialog({ shift, date: shift.date })}
              onCreateShift={(date) => setDialog({ date })}
            />
          )}

          {venue && dialog && (
            <ShiftEditorDialog
              open
              onOpenChange={(open) => {
                if (!open) setDialog(null);
              }}
              operatorId={operatorId}
              venue={{ id: venue.id, name: venue.name, timezone }}
              staff={staff}
              date={dialog.date}
              shift={dialog.shift}
              existingShifts={shifts}
              canDelete={canDelete}
            />
          )}
        </>
      )}
    </div>
  );
}
