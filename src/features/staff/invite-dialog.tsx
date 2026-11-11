'use client';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { STAFF_ROLES, type Role } from '@goldstar/platform';
import { callable } from '@/lib/firebase/callables';
import { toast } from '@/lib/toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/forms/Input';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface InviteDialogVenue {
  id: string;
  name: string;
}

export interface InviteResult {
  inviteId: string;
  email: string;
  roles: InvitableRole[];
  venueIds: string[];
  displayName?: string;
}

export interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venues: InviteDialogVenue[];
  /** Called after a successful `identityInvite` — lets the staff page track resend/revoke targets
   * for this session (pending invitations are Functions-only in `firestore.rules`; there is no list
   * callable in the contract, so this is the only way the dashboard learns an inviteId — see
   * `staff-table.tsx`'s own header comment for the disclosed persistence gap). */
  onInvited?: (result: InviteResult) => void;
}

/**
 * Human labels for the invitable role set. `@goldstar/platform`'s `INVITABLE_ROLES`
 * (`[...STAFF_ROLES, 'venue_user']`) is NOT exported from the package (verified against the
 * installed v0.3.5 `dist/index.d.ts` — only `ROLES`/`STAFF_ROLES` are) — rebuilt here from the two
 * exports that ARE public, in the same order, rather than hand-copying the private list and risking
 * drift. `identityInvite`'s own zod schema is still the source of truth server-side; a caller without
 * permission for a given role (e.g. non-owner inviting an owner) gets `permission_denied` back from
 * the callable, surfaced via the existing `toast.error(e)` path below.
 */
const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform admin', owner: 'Owner', admin: 'Admin', lead: 'Lead', attendant: 'Attendant', driver: 'Driver', venue_user: 'Venue user', guest: 'Guest',
};
const INVITABLE_ROLES = [...STAFF_ROLES, 'venue_user'] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
const ROLE_OPTIONS = INVITABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

const formSchema = z.object({
  email: z.string().email('Enter a valid email'),
  roles: z.array(z.enum(INVITABLE_ROLES)).min(1, 'Select at least one role'),
  venueIds: z.array(z.string()).default([]),
  displayName: z.string().optional(),
});
// z.input (defaultValues/reset shape) vs z.output (onSubmit shape) — `venueIds`'s `.default([])`
// makes it optional on input but required on output; same split, same reason as venue-form.tsx's
// own `VenueFormInput`/`VenueFormValues`.
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

const DEFAULTS: FormInput = { email: '', roles: [], venueIds: [], displayName: '' };

/** Toggles `value` in/out of `list`, returning a NEW array in `order`'s canonical relative order —
 * click order never determines output order (matters for the given test: Attendant then Driver
 * checked in that order must produce `['attendant', 'driver']`, which also happens to be click
 * order here, but this doesn't rely on that coincidence for any other combination). */
function toggledInOrder<T>(list: readonly T[], value: T, checked: boolean, order: readonly T[]): T[] {
  const next = new Set(list);
  if (checked) next.add(value);
  else next.delete(value);
  return order.filter((v) => next.has(v));
}

export function InviteDialog({ open, onOpenChange, venues, onInvited }: InviteDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(formSchema), defaultValues: DEFAULTS });

  const venueOrder = venues.map((v) => v.id);

  const onSubmit = async (values: FormValues) => {
    try {
      const identityInvite = callable('identityInvite');
      const trimmedName = values.displayName?.trim();
      // Conditional spread (not `displayName: trimmedName || undefined` set directly) — an omitted
      // key, not an explicit `undefined` value, is this workspace's convention for "not set" at a
      // callable/Firestore write boundary (T5 lesson).
      const out = await identityInvite({ email: values.email, roles: values.roles, venueIds: values.venueIds, ...(trimmedName ? { displayName: trimmedName } : {}) });
      toast.success('Invitation sent');
      onInvited?.({ inviteId: out.inviteId, email: values.email, roles: values.roles, venueIds: values.venueIds, ...(trimmedName ? { displayName: trimmedName } : {}) });
      reset(DEFAULTS);
      onOpenChange(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Invite staff</DialogTitle>
          <DialogDescription>They&apos;ll get an email with a link to set a password and join.</DialogDescription>
        </DialogHeader>
        {/* noValidate: zod is the single source of validation truth (same reasoning as venue-form.tsx). */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <Input label="Email" type="email" fullWidth error={errors.email?.message} {...register('email')} />
          <Input label="Display name" fullWidth {...register('displayName')} />

          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">
              Roles
            </Text>
            <Controller
              name="roles"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const id = `invite-role-${opt.value}`;
                    const checked = field.value.includes(opt.value);
                    return (
                      <div key={opt.value} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          aria-label={opt.label}
                          onCheckedChange={(v) => field.onChange(toggledInOrder(field.value, opt.value, v === true, INVITABLE_ROLES))}
                        />
                        <label htmlFor={id} className="cursor-pointer text-body-sm text-text-primary">
                          {opt.label}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles?.message && (
              <Text size="xs" color="tertiary" className="text-error-600">
                {errors.roles.message}
              </Text>
            )}
          </div>

          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">
              Venues
            </Text>
            {venues.length === 0 ? (
              <Text size="sm" color="tertiary">
                No venues yet.
              </Text>
            ) : (
              <Controller
                name="venueIds"
                control={control}
                render={({ field }) => {
                  const value = field.value ?? [];
                  return (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {venues.map((venue) => {
                      const id = `invite-venue-${venue.id}`;
                      const checked = value.includes(venue.id);
                      return (
                        <div key={venue.id} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={checked}
                            aria-label={venue.name}
                            onCheckedChange={(v) => field.onChange(toggledInOrder(value, venue.id, v === true, venueOrder))}
                          />
                          <label htmlFor={id} className="cursor-pointer text-body-sm text-text-primary">
                            {venue.name}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  );
                }}
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
