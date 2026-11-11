'use client';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, deleteField, setDoc, updateDoc } from 'firebase/firestore';
import { fleetVehicleSchema, uuidv7, type FleetVehicle } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { toast } from '@/lib/toast';
import { stripUndefinedDeep } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Textarea } from '@/components/ui/forms/Textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface FleetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operatorId: string;
  /** Omit to create a new vehicle; pass the existing doc to edit one. */
  vehicle?: FleetVehicle;
}

/**
 * `FleetForm` = `fleetVehicleSchema.omit({ currentDriverUid: true })` — `currentDriverUid` is
 * Functions-only (`firestore.rules`' `fleetVehicles` update rule: `unchanged(['currentDriverUid'])`
 * for an admin write; only `dispatchAssign` sets it). Omitting it from the schema entirely (rather
 * than including-then-stripping, like `venue-form.tsx`'s `qr` handling) means it's never even in
 * `values` to accidentally send — simpler because, unlike `venue`'s `qr`, this is the ONLY field
 * this form must never touch, and there's no create-time default for it to seed either.
 *
 * `state` is `z.string().length(2).optional()` in the real schema (verified against
 * `goldstar-platform/src/schemas/fleetVehicle.ts`) — an untouched-then-cleared `<input>` submits
 * `''`, not `undefined`, which `.length(2)` would then reject as an invalid 2-letter state rather
 * than "not set". Same fix, same reasoning as `venue-form.tsx`'s own `phone`/`timezone`
 * `z.preprocess`. `notes` needs no such preprocessing — `z.string().max(500).optional()` has no
 * minimum length, so `''` already validates fine as "no notes" without any special-casing (though
 * `withClearedFieldsDeleted` below still only fires `deleteField()` for a true `undefined`, so a
 * cleared `notes` is stored as `''` rather than deleted — a disclosed, low-stakes distinction for a
 * free-text field with no length floor).
 */
const formSchema = fleetVehicleSchema.omit({ currentDriverUid: true }).extend({
  state: z.preprocess((v) => (v === '' ? undefined : v), fleetVehicleSchema.shape.state),
});
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];

function defaultsFrom(operatorId: string, vehicle?: FleetVehicle): FormInput {
  return {
    id: vehicle?.id ?? uuidv7(),
    operatorId,
    plate: vehicle?.plate ?? '',
    state: vehicle?.state,
    make: vehicle?.make ?? '',
    model: vehicle?.model ?? '',
    color: vehicle?.color ?? '',
    capacity: vehicle?.capacity ?? 4,
    accessible: vehicle?.accessible ?? false,
    status: vehicle?.status ?? 'available',
    notes: vehicle?.notes,
  };
}

/** Same "an omitted key means leave it, so a deliberate clear needs deleteField()" fix as
 * `venue-form.tsx`'s `withClearedFieldsDeleted` — scoped to this form's only two optional fields
 * (`state`, `notes`) rather than a general-purpose helper, since that's all there is to clear here. */
function withClearedFieldsDeleted(stripped: Record<string, unknown>, values: FormValues, priorVehicle: FleetVehicle): Record<string, unknown> {
  const payload = { ...stripped };
  if (values.state === undefined && priorVehicle.state !== undefined) payload.state = deleteField();
  if (values.notes === undefined && priorVehicle.notes !== undefined) payload.notes = deleteField();
  return payload;
}

export function FleetForm({ open, onOpenChange, operatorId, vehicle }: FleetFormProps) {
  const isEdit = !!vehicle;
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaultsFrom(operatorId, vehicle) });

  const handleOpenChange = (next: boolean) => {
    if (!next) reset(defaultsFrom(operatorId, vehicle));
    onOpenChange(next);
  };

  const onSubmit = async (values: FormValues) => {
    const { db } = firebase();
    const ref = doc(db, `operators/${operatorId}/fleetVehicles/${values.id}`);
    try {
      if (!vehicle) {
        await setDoc(ref, stripUndefinedDeep(values));
        toast.success('Vehicle added');
      } else {
        const stripped = stripUndefinedDeep(values) as Record<string, unknown>;
        await updateDoc(ref, withClearedFieldsDeleted(stripped, values, vehicle));
        toast.success('Vehicle saved');
      }
      handleOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>{isEdit ? 'Edit vehicle' : 'Add vehicle'}</DialogTitle>
          <DialogDescription>Plate, make/model, capacity, and whether it&rsquo;s wheelchair-accessible.</DialogDescription>
        </DialogHeader>
        {/* noValidate: zod is the single source of validation truth (venue-form.tsx's own reasoning). */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Plate" fullWidth error={errors.plate?.message} {...register('plate')} />
            <Input label="State" fullWidth error={errors.state?.message} {...register('state')} />
            <Input label="Make" fullWidth error={errors.make?.message} {...register('make')} />
            <Input label="Model" fullWidth error={errors.model?.message} {...register('model')} />
            <Input label="Color" fullWidth error={errors.color?.message} {...register('color')} />
            <Input label="Capacity" type="number" min={1} max={8} fullWidth error={errors.capacity?.message} {...register('capacity', { valueAsNumber: true })} />
          </div>

          <Select label="Status" selectSize="md" options={STATUS_OPTIONS} error={errors.status?.message} {...register('status')} />

          <Controller
            name="accessible"
            control={control}
            render={({ field }) => (
              <label className="flex min-h-11 items-center gap-2">
                <Checkbox id="fleet-accessible" checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <Text as="span" size="sm">
                  Wheelchair-accessible
                </Text>
              </label>
            )}
          />

          <Textarea label="Notes" fullWidth error={errors.notes?.message} {...register('notes')} />

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save' : 'Add vehicle'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
