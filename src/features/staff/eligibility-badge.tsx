import type { Eligibility } from '@goldstar/platform';
import { StatusPill } from '@/components/ui/status-pill';

export interface EligibilityBadgeProps {
  eligibility: Eligibility;
  /**
   * Which eligibility flag to show. Defaults to `'driveHome'` — `staff-table.tsx`'s existing call
   * site (a general roster view) is unchanged by this addition. Added for the dispatch driver
   * picker (Plan 5 Task 4, `src/features/dispatch/driver-picker.tsx`), which needs the SAME badge
   * for a `passenger_ride` primary-driver context.
   *
   * Disclosed limitation (task-45-report.md): `Eligibility.reasons` is a single flat array covering
   * BOTH `driveHome` and `passengerRide` — the schema doesn't split reasons per-field, so the
   * tooltip below shows every reason regardless of which field's badge is rendered. A driver who
   * fails `driveHome` (e.g. `license_expired`) but passes `passengerRide` still shows that reason in
   * the `passengerRide` badge's tooltip. Not fixable client-side; the raw boolean is still correct.
   */
  field?: 'driveHome' | 'passengerRide';
}

/** Human labels for `computeEligibility`'s `reasons[]` codes (`functions/src/modules/identity/eligibility.ts`
 * in the platform repo — kept in sync by hand, same convention as this repo's own `error-copy.ts`). */
const REASON_LABELS: Record<string, string> = {
  missing_driver_role: 'Not assigned the driver role',
  license_missing: 'No license on file',
  license_expired: 'License expired (or expires within 24h)',
  insurance_missing: 'No insurance on file',
  insurance_expired: 'Insurance expired (or expires within 24h)',
  background_not_approved: 'Background check not approved',
  missing_ride_endorsement: 'Missing a required ride endorsement',
};

/**
 * Drive-home eligibility ✓/✗ for the staff table. Reasons show as a native `title` tooltip on hover
 * — this workspace has no dedicated Tooltip primitive yet (checked `.agent/COMPONENT_LIBRARY.md` and
 * `src/components/ui/`), and building one for this single call site would be premature; the native
 * attribute is a reasonable, zero-new-component fallback. Disclosed judgment call.
 */
export function EligibilityBadge({ eligibility, field = 'driveHome' }: EligibilityBadgeProps) {
  const ok = field === 'driveHome' ? eligibility.driveHome : eligibility.passengerRide;
  const fieldLabel = field === 'driveHome' ? 'Drive-home' : 'Ride';
  const label = ok ? `${fieldLabel} ✓` : `${fieldLabel} ✗`;
  const title = eligibility.reasons.length > 0 ? eligibility.reasons.map((r) => REASON_LABELS[r] ?? r).join('; ') : `Meets all ${fieldLabel.toLowerCase()} requirements`;
  return (
    <span title={title}>
      <StatusPill label={label} tone={ok ? 'positive' : 'negative'} />
    </span>
  );
}
