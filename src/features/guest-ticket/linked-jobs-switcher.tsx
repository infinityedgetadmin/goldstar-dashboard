import { CHARGE_LABELS, type GuestTicket } from '@goldstar/platform';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/typography';

/**
 * Job-type label, from the contracts package rather than a local copy. This file used to declare
 * `Record<JobType, string> = { valet: 'Valet', drive_home: 'Drive home', passenger_ride: 'Ride' }`
 * — byte-identical to `CHARGE_LABELS`, which arrived here with the v0.4.2 re-vendor. Ruling AN
 * exported that constant precisely to end this duplication: the platform's receipt email and
 * goldstar-mobile's `chargeLabel()` each carried their own copy behind a stay-in-sync comment, and
 * nothing mechanical stopped one from drifting. A third hand-copy in the guest surface would have
 * been the same bug with a wider blast radius — the guest reads this label and the charge line for
 * the same job.
 *
 * No bundle cost: `@goldstar/platform`'s runtime is already in the guest graph (`PlatformError`,
 * `computeTip`, `callables`), so this is a named import from a module that was loading anyway —
 * NOT the dashboard-module pull the `humanizeStatus` comment below rightly refuses.
 *
 * Tests assert the LITERAL strings ('Drive home · En Route To Guest'), deliberately. Rewriting
 * them to `CHARGE_LABELS.drive_home` would compare the constant to itself and prove nothing; the
 * literals are what make an edit to the shared constant fail a test here instead of propagating
 * silently. Do not "deduplicate" them.
 */
const JOB_TYPE_LABEL = CHARGE_LABELS;

/** `requested` -> `Requested`, `en_route_to_guest` -> `En route to guest`. A dedicated per-status
 * label map (the dashboard's `src/features/live/status-copy.ts` STATUS_LABEL) is deliberately NOT
 * imported here — that file lives outside the guest bundle's graph, and pulling a dashboard-only
 * module into `(public)` code is exactly the kind of unexplained-KB-jump `check:guest-bundle`
 * exists to catch (see this repo's the project notes). A plain humanize is enough for a pill label. */
function humanizeStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface LinkedJobsSwitcherProps {
  jobs: GuestTicket['linkedJobs'];
  selectedToken: string | null;
  onSelect: (token: string) => void;
}

/**
 * Job5 Task 5: one pill per `ticket.linkedJobs` entry (jobType + status), selecting one drives
 * `ticket-view.tsx`'s `JobTrackingView` via that entry's own `token`. Deliberately no
 * auto-selection (disclosed judgment call, task-45-report.md): the existing "Drive home requested
 * — view status" ghost button + sheet (Ruling H) already opens a live `useGuestTicket(jobToken)`
 * subscription on the SAME active job when tapped — auto-selecting here too would mean two
 * concurrent listeners on the same doc from the moment the page loads, for no UX benefit (the
 * switcher's whole point is letting a guest with MULTIPLE linked jobs — including past,
 * non-active ones the ghost-button flow never surfaces at all — pick which one to view).
 *
 * Renders every entry, not just active ones: a guest can look back at a completed trip's final
 * driver/ETA via this switcher even after the ghost button has reverted to a fresh "Request a
 * ride" state.
 */
export function LinkedJobsSwitcher({ jobs, selectedToken, onSelect }: LinkedJobsSwitcherProps) {
  if (jobs.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Text as="span" size="xs" color="tertiary" className="uppercase tracking-wide">
        Linked trips
      </Text>
      <div role="tablist" aria-label="Linked trips" className="flex flex-wrap gap-2">
        {jobs.map((job) => {
          const active = job.token === selectedToken;
          return (
            <button
              key={job.token}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(job.token)}
              className={cn(
                'min-h-11 rounded-full border px-4 text-ui-sm font-medium transition-colors',
                active
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-border bg-bg-primary text-text-secondary hover:bg-bg-secondary'
              )}
            >
              {JOB_TYPE_LABEL[job.jobType]} · {humanizeStatus(job.status)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
