'use client';
import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { STAFF_ROLES, type Role, type User, type Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';
import { useSession } from '@/features/auth/use-session';
import { toast } from '@/lib/toast';
import { stripUndefinedDeep, sameSet, sameRecord } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/forms/Input';
import { Select } from '@/components/ui/forms/Select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';

export interface UserEditorProps {
  operatorId: string;
  user: User;
  venues: Venue[];
}

const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform admin', owner: 'Owner', admin: 'Admin', lead: 'Lead', attendant: 'Attendant', driver: 'Driver', venue_user: 'Venue user', guest: 'Guest',
};
// Excludes 'platform_admin' entirely — firestore.rules' roleCeilingOk() forbids it unconditionally,
// for every caller, on every operator-scoped user doc; there is no UI path that could ever submit it.
const EDITABLE_ROLES = [...STAFF_ROLES, 'venue_user'] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

const formSchema = z.object({
  roles: z.array(z.enum(EDITABLE_ROLES)).min(1, 'Select at least one role'),
  venueIds: z.array(z.string()).default([]),
  // 'invited' is a real userSchema status value, but it has ZERO writers anywhere in
  // goldstar-platform's functions/src (grepped directly) — accept.ts's user-doc-creation
  // transaction sets status: 'active' unconditionally, never 'invited' (fix round 1, task-6-review.md
  // Nit 1: the original comment here claimed 'invited' gets set once by identityAcceptInvitation,
  // which is backwards — that handler is the one place it's guaranteed NOT to be set). This editor
  // only ever toggles an existing user between the two states the brief actually asks for ("status
  // suspend/reactivate"); there is no live state this UI would ever need to hand a user back to.
  status: z.enum(['active', 'suspended']),
  externalIds: z.array(z.object({ key: z.string().min(1, 'Required'), value: z.string().min(1, 'Required') })).default([]),
});
// z.input (defaultValues shape) vs z.output (onSubmit shape) — `venueIds`/`externalIds`'s
// `.default([])` makes them optional on input but required on output; same split as venue-form.tsx.
type FormInput = z.input<typeof formSchema>;
type FormValues = z.output<typeof formSchema>;

function defaultsFrom(user: User): FormInput {
  return {
    // Cast: this editor only ever renders for operator-scoped staff (owner/admin/lead/attendant/
    // driver/venue_user) — a `platform_admin`/`guest` row is never routed through it in practice.
    roles: user.roles as EditableRole[],
    venueIds: user.venueIds,
    status: user.status === 'suspended' ? 'suspended' : 'active',
    externalIds: Object.entries(user.externalIds ?? {}).map(([key, value]) => ({ key, value })),
  };
}

function toggledInOrder<T>(list: readonly T[], value: T, checked: boolean, order: readonly T[]): T[] {
  const next = new Set(list);
  if (checked) next.add(value);
  else next.delete(value);
  return order.filter((v) => next.has(v));
}

/**
 * Admin+ editor for an existing staff member's roles, venues, status, and `externalIds` (scheduling
 * provider ids). Writes directly to Firestore (`updateDoc`, not a callable) — verified against
 * `firestore.rules`' `/users/{uid}` `allow update` rule (goldstar-platform repo): an admin/platform
 * admin caller may change `roles`/`venueIds`/`status`/`externalIds`/`credentials` freely as long as
 * `uid`/`operatorId`/`eligibility`/`stripeConnectAccountId`/`payoutStatus` stay `unchanged`, and (if
 * `roles` changed) `roleCeilingOk` holds — no `identityUpdateUser`-style callable exists in the
 * contract, and none is needed for this path (task-6-report.md has the full investigation).
 */
export function UserEditor({ operatorId, user, venues }: UserEditorProps) {
  const { claims } = useSession();
  const callerRoles = claims?.roles ?? [];
  const canGrantOwner = callerRoles.includes('owner') || callerRoles.includes('platform_admin');

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaultsFrom(user) });

  const venueOrder = venues.map((v) => v.id);
  const statusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ];

  // The ORIGINAL, as-loaded values — compared against on submit to decide what actually changed.
  // FROZEN at mount (`useState`'s lazy initializer, not derived from the live `user` prop on every
  // render): `user` is fed by a live `onSnapshot` subscription one level up (`staff-detail.tsx`), so
  // reading it fresh here would mean a CONCURRENT edit that lands while this admin still has the form
  // open changes what "original" means mid-session — an untouched field would then look "changed"
  // relative to the new live value and get overwritten with this admin's stale, unedited copy of it,
  // which is the exact clobbering bug this fix exists to prevent, just introduced a different way.
  // Kept as plain values (not `formState.dirtyFields`) so "changed" means genuinely-different
  // CONTENT, order-independent for the two array fields (`sameSet`) — `toggledInOrder` always
  // re-sorts into canonical order, so a naive reference/stringify comparison against the stored
  // (possibly differently-ordered) array could false-positive "changed" on an identical set.
  const [original] = useState(() => ({
    roles: user.roles,
    venueIds: user.venueIds,
    status: (user.status === 'suspended' ? 'suspended' : 'active') as 'active' | 'suspended',
    externalIds: user.externalIds ?? {},
  }));

  /**
   * Fix round 1 (task-6-review.md Major 3): `roleCeilingOk` (`firestore.rules`) evaluates the ENTIRE
   * submitted `roles` ARRAY, not a diff of what changed — so a non-owner admin who edits ANYTHING
   * else in the roles group (e.g. checks Driver) on an owner-role user was resubmitting `roles`
   * still containing `'owner'` (the checkbox is disabled, not excluded), which `mapChanged('roles')`
   * sees as changed and `roleCeilingOk` then denies for a non-owner caller — failing the WHOLE save,
   * including the venues/status/externalIds edits that would otherwise have been allowed, with no
   * indication of why.
   *
   * Two-part fix: (1) only genuinely-changed top-level fields are sent at all (compared against the
   * ORIGINAL loaded values, matching `CredentialsPanel`'s same fix for Major 2) — a non-owner admin
   * who never touches the roles group omits `roles` from the payload entirely, so `mapChanged('roles')`
   * is false and the unrelated edits succeed. (2) if `roles` DID genuinely change and the submitted
   * array still contains `'owner'` while this caller can't grant it, block BEFORE calling `updateDoc`
   * at all — this exact write is doomed server-side regardless of what else is in the payload, so
   * failing it here with specific copy is strictly better than either a generic sanitized-error toast
   * or (worse) silently dropping just the roles key and reporting success on a save the admin
   * explicitly asked for and didn't get.
   *
   * `toast.info`, not `toast.error`, for that specific copy: `toast.error`'s signature is
   * `(error: unknown, context?)` and always routes through `sanitizeError`, which only recognizes a
   * real `PlatformError` and falls back to the GENERIC message for anything else (this workspace's
   * error-handling rule: never show `error.message`/raw strings via `toast.error`) — passing this
   * hardcoded, pre-vetted, already-safe copy there would silently render as "Something went wrong."
   * instead of the specific explanation. `toast.info` shows its `message` argument verbatim, which is
   * exactly what a deliberate, safe, client-side validation message (not a caught runtime error) needs.
   */
  const onSubmit = async (values: FormValues) => {
    const rolesChanged = !sameSet(values.roles, original.roles);
    const venueIdsChanged = !sameSet(values.venueIds, original.venueIds);
    const statusChanged = values.status !== original.status;
    const externalIds = Object.fromEntries(values.externalIds.map((e) => [e.key, e.value]));
    const externalIdsChanged = !sameRecord(externalIds, original.externalIds);

    if (rolesChanged && !canGrantOwner && values.roles.includes('owner')) {
      toast.info("Only an owner can change an owner's roles.");
      return;
    }
    try {
      const { db } = firebase();
      const payload: Record<string, unknown> = {};
      if (rolesChanged) payload.roles = values.roles;
      if (venueIdsChanged) payload.venueIds = values.venueIds;
      if (statusChanged) payload.status = values.status;
      if (externalIdsChanged) payload.externalIds = externalIds;
      if (Object.keys(payload).length === 0) {
        toast.info('Nothing to save.');
        return;
      }
      await updateDoc(doc(db, `operators/${operatorId}/users/${user.uid}`), stripUndefinedDeep(payload));
      toast.success('Staff member updated.');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Roles &amp; venues</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">
              Roles
            </Text>
            <Controller
              name="roles"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {EDITABLE_ROLES.map((role) => {
                    const id = `edit-role-${role}`;
                    const checked = field.value.includes(role);
                    const disabled = role === 'owner' && !canGrantOwner;
                    return (
                      <div key={role} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          disabled={disabled}
                          aria-label={ROLE_LABELS[role]}
                          onCheckedChange={(v) => field.onChange(toggledInOrder(field.value, role, v === true, EDITABLE_ROLES))}
                        />
                        <label htmlFor={id} className="cursor-pointer text-body-sm text-text-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={disabled}>
                          {ROLE_LABELS[role]}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            />
            {errors.roles?.message && (
              <Text size="xs" className="text-error-600">
                {errors.roles.message}
              </Text>
            )}
          </div>

          <div className="space-y-2">
            <Text as="span" size="sm" weight="medium">
              Venues
            </Text>
            <Controller
              name="venueIds"
              control={control}
              render={({ field }) => {
                const value = field.value ?? [];
                return (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {venues.map((venue) => {
                      const id = `edit-venue-${venue.id}`;
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
          </div>

          <Controller
            name="status"
            control={control}
            render={({ field }) => <Select label="Status" options={statusOptions} value={field.value} onChange={(e) => field.onChange(e.target.value)} />}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scheduling provider ids</CardTitle>
        </CardHeader>
        <CardContent>
          <Controller
            name="externalIds"
            control={control}
            render={({ field }) => {
              const value = field.value ?? [];
              return (
              <div className="space-y-3">
                {value.length === 0 && (
                  <Text size="sm" color="tertiary">
                    No external ids yet.
                  </Text>
                )}
                {value.map((entry, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3">
                    <Input
                      placeholder="Provider (e.g. deputy)"
                      value={entry.key}
                      aria-label={`External id provider ${i + 1}`}
                      onChange={(e) => field.onChange(value.map((row, j) => (j === i ? { ...row, key: e.target.value } : row)))}
                    />
                    <Input
                      placeholder="Provider user id"
                      value={entry.value}
                      aria-label={`External id value ${i + 1}`}
                      onChange={(e) => field.onChange(value.map((row, j) => (j === i ? { ...row, value: e.target.value } : row)))}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-4 w-4" />}
                      iconPosition="left"
                      onClick={() => field.onChange(value.filter((_, j) => j !== i))}
                    >
                      <span className="sr-only">{`Remove external id ${i + 1}`}</span>
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} iconPosition="left" onClick={() => field.onChange([...value, { key: '', value: '' }])}>
                  Add external id
                </Button>
              </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <Button type="submit" loading={isSubmitting}>
        Save changes
      </Button>
    </form>
  );
}
