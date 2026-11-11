'use client';
import { AlertTriangle } from 'lucide-react';
import { STAFF_ROLES, type Role } from '@goldstar/platform';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/forms/Select';
import { Text } from '@/components/ui/typography';

export interface AssignmentPickerStaff {
  uid: string;
  displayName: string;
  roles: Role[];
}

// `shiftAssignmentSchema.role` is `z.enum(ROLES)` — the FULL role enum, not `STAFF_ROLES` — so this
// stays `Role`-typed to match the contract exactly, even though the dropdown below only ever OFFERS
// staff-tier roles (owner/admin/lead/attendant/driver) as choices.
export interface AssignmentPickerValue {
  uid: string;
  role: Role;
}

export interface AssignmentPickerProps {
  /** Staff already narrowed to "has a staff role at this venue" by the caller. */
  staff: AssignmentPickerStaff[];
  assignments: AssignmentPickerValue[];
  onChange: (next: AssignmentPickerValue[]) => void;
  /** uid -> a human-readable overlap warning, e.g. "Also on Weekend Brunch, 5:00 PM–6:00 PM". */
  conflicts?: Record<string, string>;
  disabled?: boolean;
}

const ROLE_LABELS: Record<(typeof STAFF_ROLES)[number], string> = { owner: 'Owner', admin: 'Admin', lead: 'Lead', attendant: 'Attendant', driver: 'Driver' };
const ROLE_OPTIONS: { value: Role; label: string }[] = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));

/**
 * Checkbox list of eligible staff (already filtered to "has a staff role at this venue" by
 * `shift-editor-dialog.tsx`), each with its own role selector defaulting to that person's first
 * role, plus an inline overlap-conflict warning when the caller supplies one.
 */
export function AssignmentPicker({ staff, assignments, onChange, conflicts = {}, disabled = false }: AssignmentPickerProps) {
  const byUid = new Map(assignments.map((a) => [a.uid, a]));

  const toggle = (person: AssignmentPickerStaff, checked: boolean) => {
    if (checked) {
      onChange([...assignments, { uid: person.uid, role: person.roles[0] ?? 'attendant' }]);
    } else {
      onChange(assignments.filter((a) => a.uid !== person.uid));
    }
  };

  const changeRole = (uid: string, role: Role) => {
    onChange(assignments.map((a) => (a.uid === uid ? { ...a, role } : a)));
  };

  if (staff.length === 0) {
    return (
      <Text size="sm" color="tertiary">
        No staff with a role at this venue yet.
      </Text>
    );
  }

  return (
    <div className="space-y-2">
      {staff.map((person) => {
        const id = `assignment-${person.uid}`;
        const current = byUid.get(person.uid);
        const checked = current !== undefined;
        const conflict = conflicts[person.uid];
        const roleOptions = ROLE_OPTIONS.filter((o) => person.roles.includes(o.value));
        return (
          <div key={person.uid} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
            <Checkbox id={id} checked={checked} aria-label={person.displayName} disabled={disabled} onCheckedChange={(v) => toggle(person, v === true)} />
            <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-body-sm text-text-primary">
              {person.displayName}
            </label>
            {checked && (
              <Select
                selectSize="sm"
                aria-label={`${person.displayName} role`}
                options={roleOptions.length > 0 ? roleOptions : ROLE_OPTIONS}
                value={current.role}
                disabled={disabled}
                onChange={(e) => changeRole(person.uid, e.target.value as Role)}
              />
            )}
            {checked && conflict && (
              <div className="flex w-full items-center gap-1.5 text-ui-xs text-warning-700">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{conflict}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
