'use client';
import type { User } from '@goldstar/platform';
import { EligibilityBadge } from '@/features/staff/eligibility-badge';
import { Text } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

export interface DriverPickerProps {
  label: string;
  drivers: User[];
  /** Which `Eligibility` flag gates selection — `driveHome` for a drive_home primary/chase driver,
   * `passengerRide` for a ride's primary driver (mirrors `dispatchAssign`'s own server-side
   * `isDriverEligible(..., primaryField)` check in `functions/src/modules/dispatch/assign.ts`). */
  requiredField: 'driveHome' | 'passengerRide';
  value: string | undefined;
  onChange: (uid: string) => void;
  /** Distinct-driver enforcement (drive_home chase vs. primary — `dispatchAssign` rejects
   * `chaseDriverUid === primaryDriverUid` with `invalid_argument`). The matching uid is greyed out
   * with `excludeReason` rather than hidden, so staff can see WHY it's unavailable rather than
   * wondering where a driver went. */
  excludeUid?: string;
  excludeReason?: string;
}

/**
 * Eligible-driver list for the dispatch assign dialog (Plan 5 Task 4): every driver, each row
 * showing the SAME `EligibilityBadge` the staff roster uses (reused, not rebuilt — task-45-brief.md
 * ruling), ineligible or excluded rows greyed and disabled rather than hidden entirely (same
 * "explain why, don't just hide" pattern `EligibilityBadge` itself already uses for its reasons
 * tooltip).
 */
export function DriverPicker({ label, drivers, requiredField, value, onChange, excludeUid, excludeReason }: DriverPickerProps) {
  return (
    <div className="space-y-2">
      <Text as="span" size="sm" weight="medium">
        {label}
      </Text>
      <div role="radiogroup" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {drivers.length === 0 ? (
          <Text size="sm" color="tertiary" className="px-3 py-2">
            No drivers available.
          </Text>
        ) : (
          drivers.map((driver) => {
            const eligibility = driver.eligibility ?? { driveHome: false, passengerRide: false, reasons: [] };
            const eligible = requiredField === 'driveHome' ? eligibility.driveHome : eligibility.passengerRide;
            const excluded = driver.uid === excludeUid;
            const disabled = !eligible || excluded;
            const selected = driver.uid === value;
            return (
              <button
                key={driver.uid}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                title={excluded ? excludeReason : undefined}
                onClick={() => onChange(driver.uid)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-body-sm transition-colors',
                  selected && !disabled ? 'bg-primary-50 text-primary-700' : 'text-text-primary hover:bg-bg-secondary',
                  disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                )}
              >
                <span className="truncate">{driver.displayName}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {excluded ? (
                    <Text as="span" size="xs" color="tertiary">
                      {excludeReason}
                    </Text>
                  ) : null}
                  <EligibilityBadge eligibility={eligibility} field={requiredField} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
