'use client';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, deleteDoc, deleteField, setDoc, updateDoc } from 'firebase/firestore';
import { SCHEDULING_PROVIDERS, STAFF_ROLES, uuidv7, type Role, type Shift } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Button } from '@/components/ui/buttons';
import { Badge } from '@/components/ui/badge';
import { Text } from '@/components/ui/typography';
import { AssignmentPicker, type AssignmentPickerValue } from './assignment-picker';
import { ClockAuditPanel } from './clock-audit-panel';
import { TipPoolPanel } from './tip-pool-panel';
import { shiftTimesToIso, isoToVenueTime, formatVenueDateTime, formatVenueTime } from './time';

export interface ShiftEditorDialogVenue {
  id: string;
  name: string;
  timezone: string;
}

export interface ShiftEditorDialogStaff {
  uid: string;
  displayName: string;
  roles: Role[];
  venueIds: string[];
}

export interface ShiftEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operatorId: string;
  venue: ShiftEditorDialogVenue;
  /** Full staff roster — narrowed to "has a staff role at this venue" internally. */
  staff: ShiftEditorDialogStaff[];
  /** Create-mode target date (`yyyy-MM-dd`); ignored when `shift` is passed (edit mode keeps the shift's own `date`). */
  date: string;
  /** Omit to create a new internal shift; pass an existing doc to edit one. */
  shift?: Shift;
  /**
   * Other shifts already loaded by the caller (this venue's visible week) — used only to compute
   * the overlap-conflict warning; advisory only, not enforced. Known scope limit (disclosed): this
   * can only see shifts the calendar already has loaded (current venue + visible week), not a
   * cross-venue/cross-week check across the whole operator.
   */
  existingShifts?: Shift[];
  /** owner/admin only — `firestore.rules`' `shifts` delete rule is `isAdmin()`, stricter than the `isManager()` create/update it otherwise gates on. */
  canDelete?: boolean;
}

const SCHEDULING_PROVIDER_LABELS: Record<(typeof SCHEDULING_PROVIDERS)[number], string> = { internal: 'Internal', ical: 'iCal', when_i_work: 'When I Work' };

const STATUS_OPTIONS = [
  { value: 'planned', label: 'Planned' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

const formSchema = z
  .object({
    startsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Enter a start time'),
    endsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Enter an end time'),
    leadUid: z.string().optional(),
    notes: z.string().max(1000).optional(),
    status: z.enum(['planned', 'open', 'closed']),
  })
  // Fix round 1, n2 (task-2-review.md): equal start/end times used to satisfy
  // `shiftTimesToIso`'s `endsAt <= startsAt` overnight-rollover check (equality included), silently
  // producing a full 24-hour shift instead of flagging the input — a manager fat-fingering the end
  // time shouldn't get a full-day shift with no warning.
  .refine((v) => v.startsAt !== v.endsAt, { message: "Start and end can't be the same time", path: ['endsAt'] });
type FormValues = z.infer<typeof formSchema>;

export function ShiftEditorDialog({ open, onOpenChange, operatorId, venue, staff, date, shift, existingShifts = [], canDelete = false }: ShiftEditorDialogProps) {
  const isEdit = !!shift;
  const isExternal = isEdit && shift.source.provider !== 'internal';
  const shiftDate = shift?.date ?? date;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      startsAt: shift ? isoToVenueTime(shift.startsAt, venue.timezone) : '',
      endsAt: shift ? isoToVenueTime(shift.endsAt, venue.timezone) : '',
      leadUid: shift?.leadUid ?? '',
      notes: shift?.notes ?? '',
      status: shift?.status ?? 'planned',
    },
  });

  const [assignments, setAssignments] = useState<AssignmentPickerValue[]>(() => (shift ? shift.assignments.map((a) => ({ uid: a.uid, role: a.role })) : []));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const staffByUid = useMemo(() => new Map(staff.map((s) => [s.uid, { displayName: s.displayName }])), [staff]);

  const eligibleStaff = useMemo(
    () =>
      staff
        .filter((s) => s.venueIds.includes(venue.id) && s.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)))
        .map((s) => ({ uid: s.uid, displayName: s.displayName, roles: s.roles.filter((r) => (STAFF_ROLES as readonly string[]).includes(r)) })),
    [staff, venue.id],
  );

  const leadOptions = [{ value: '', label: 'No lead' }, ...assignments.map((a) => ({ value: a.uid, label: staffByUid.get(a.uid)?.displayName ?? a.uid }))];

  const watchedStarts = watch('startsAt');
  const watchedEnds = watch('endsAt');
  const conflicts = useMemo(() => {
    if (!watchedStarts || !watchedEnds || !/^\d{2}:\d{2}$/.test(watchedStarts) || !/^\d{2}:\d{2}$/.test(watchedEnds)) return {};
    let window: { startsAt: string; endsAt: string };
    try {
      window = shiftTimesToIso(shiftDate, watchedStarts, watchedEnds, venue.timezone);
    } catch {
      return {};
    }
    const map: Record<string, string> = {};
    for (const other of existingShifts) {
      if (isEdit && other.id === shift.id) continue;
      if (!(other.startsAt < window.endsAt && other.endsAt > window.startsAt)) continue;
      for (const a of other.assignments) {
        if (!map[a.uid]) map[a.uid] = `Also on a shift ${formatVenueDateTime(other.startsAt, venue.timezone)}–${formatVenueTime(other.endsAt, venue.timezone)}`;
      }
    }
    return map;
  }, [existingShifts, watchedStarts, watchedEnds, isEdit, shift, shiftDate, venue]);

  const onSubmit = async (values: FormValues) => {
    try {
      const { db } = firebase();
      const trimmedLead = values.leadUid?.trim();
      const trimmedNotes = values.notes?.trim() ?? '';

      if (!isEdit) {
        const { startsAt, endsAt } = shiftTimesToIso(date, values.startsAt, values.endsAt, venue.timezone);
        const id = uuidv7();
        const assignmentDocs = assignments.map((a) => ({ uid: a.uid, role: a.role, startsAt, endsAt, confirmed: false }));
        const payload = {
          id,
          operatorId,
          venueId: venue.id,
          date,
          startsAt,
          endsAt,
          ...(trimmedLead ? { leadUid: trimmedLead } : {}),
          status: 'planned' as const,
          assignments: assignmentDocs,
          notes: trimmedNotes,
          assignedUids: assignmentDocs.map((a) => a.uid),
          source: { provider: 'internal' as const },
        };
        await setDoc(doc(db, `operators/${operatorId}/shifts/${id}`), payload);
        toast.success('Shift created');
      } else if (isExternal) {
        // Read-only from Firestore's perspective for everything but status/leadUid/notes — see this
        // component's own header note on why (rules technically allow more; this is a UI-level policy).
        const payload: Record<string, unknown> = { status: values.status, notes: trimmedNotes };
        if (trimmedLead) payload.leadUid = trimmedLead;
        else if (shift.leadUid) payload.leadUid = deleteField();
        await updateDoc(doc(db, `operators/${operatorId}/shifts/${shift.id}`), payload);
        toast.success('Shift updated');
      } else {
        const { startsAt, endsAt } = shiftTimesToIso(shift.date, values.startsAt, values.endsAt, venue.timezone);
        const assignmentDocs = assignments.map((a) => ({
          uid: a.uid,
          role: a.role,
          startsAt,
          endsAt,
          confirmed: shift.assignments.find((x) => x.uid === a.uid)?.confirmed ?? false,
        }));
        const payload: Record<string, unknown> = {
          startsAt,
          endsAt,
          status: values.status,
          assignments: assignmentDocs,
          assignedUids: assignmentDocs.map((a) => a.uid),
          notes: trimmedNotes,
        };
        if (trimmedLead) payload.leadUid = trimmedLead;
        else if (shift.leadUid) payload.leadUid = deleteField();
        await updateDoc(doc(db, `operators/${operatorId}/shifts/${shift.id}`), payload);
        toast.success('Shift updated');
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const handleDelete = async () => {
    if (!shift) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    try {
      const { db } = firebase();
      await deleteDoc(doc(db, `operators/${operatorId}/shifts/${shift.id}`));
      toast.success('Shift deleted');
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="pr-12">
          <DialogTitle>{isEdit ? 'Edit shift' : 'New shift'}</DialogTitle>
          <DialogDescription>
            {venue.name} — {shiftDate}
          </DialogDescription>
        </DialogHeader>

        {isExternal && (
          <div className="flex items-center gap-2">
            <Badge variant="info">Synced from {SCHEDULING_PROVIDER_LABELS[shift.source.provider]}</Badge>
            <Text size="xs" color="tertiary">
              Times and assignments come from the external schedule — only status, lead, and notes can be changed here.
            </Text>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Starts" type="time" fullWidth disabled={isExternal} error={errors.startsAt?.message} {...register('startsAt')} />
            <Input label="Ends" type="time" fullWidth disabled={isExternal} error={errors.endsAt?.message} {...register('endsAt')} />
          </div>

          {isEdit && <Select label="Status" fullWidth options={STATUS_OPTIONS} {...register('status')} />}

          <Select label="Lead" fullWidth options={leadOptions} {...register('leadUid')} />

          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">
              Assignments
            </Text>
            <AssignmentPicker staff={eligibleStaff} assignments={assignments} onChange={setAssignments} conflicts={conflicts} disabled={isExternal} />
          </div>

          <Textarea label="Notes" fullWidth rows={3} {...register('notes')} />

          <DialogFooter className="sm:justify-between">
            {isEdit && canDelete ? (
              <Button type="button" variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
                {confirmingDelete ? 'Confirm delete' : 'Delete shift'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:space-x-2">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Save shift
              </Button>
            </div>
          </DialogFooter>
        </form>

        {isEdit && (
          <div className="space-y-5 border-t border-border pt-5">
            <ClockAuditPanel operatorId={operatorId} shift={shift} staffByUid={staffByUid} timezone={venue.timezone} />
            <TipPoolPanel shift={shift} staffByUid={staffByUid} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
