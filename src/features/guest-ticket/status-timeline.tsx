import { cn } from '@/lib/utils';
import type { JobType, TicketStatus } from '@goldstar/platform';

interface Step {
  key: string;
  label: string;
  /** Ticket statuses that map onto this display step. */
  statuses: readonly TicketStatus[];
}

// Valet: checked_in -> requested -> claimed/retrieving/staged -> ready -> delivered/closed.
const VALET_STEPS: Step[] = [
  { key: 'parked', label: 'Parked', statuses: ['checked_in'] },
  { key: 'requested', label: 'Requested', statuses: ['requested'] },
  { key: 'on-the-way', label: 'On its way', statuses: ['claimed', 'retrieving', 'staged'] },
  { key: 'ready', label: 'Ready', statuses: ['ready'] },
  { key: 'delivered', label: 'Delivered', statuses: ['delivered', 'closed'] },
];

// Drive-home: requested -> quoted/confirmed -> assigned/en_route_to_guest ->
// pre_drive_inspection/in_transit -> arrived/completed/closed. Own step
// labels — the brief only specified valet's; these are this task's own
// naming, disclosed in task-2-report.md.
const DRIVE_HOME_STEPS: Step[] = [
  { key: 'requested', label: 'Requested', statuses: ['requested'] },
  { key: 'confirmed', label: 'Confirmed', statuses: ['quoted', 'confirmed'] },
  { key: 'on-the-way', label: 'On the way to you', statuses: ['assigned', 'en_route_to_guest'] },
  { key: 'driving', label: 'Driving', statuses: ['pre_drive_inspection', 'in_transit'] },
  { key: 'arrived', label: 'Arrived', statuses: ['arrived', 'completed', 'closed'] },
];

// Passenger ride: requested -> quoted/confirmed -> assigned/en_route_to_pickup/
// arrived_pickup -> in_transit -> arrived/completed/closed.
const RIDE_STEPS: Step[] = [
  { key: 'requested', label: 'Requested', statuses: ['requested'] },
  { key: 'confirmed', label: 'Confirmed', statuses: ['quoted', 'confirmed'] },
  {
    key: 'driver-on-the-way',
    label: 'Driver on the way',
    statuses: ['assigned', 'en_route_to_pickup', 'arrived_pickup'],
  },
  { key: 'in-transit', label: 'In transit', statuses: ['in_transit'] },
  { key: 'arrived', label: 'Arrived', statuses: ['arrived', 'completed', 'closed'] },
];

const STEPS_BY_JOB_TYPE: Record<JobType, Step[]> = {
  valet: VALET_STEPS,
  drive_home: DRIVE_HOME_STEPS,
  passenger_ride: RIDE_STEPS,
};

export function StatusTimeline({ jobType, status }: { jobType: JobType; status: TicketStatus }) {
  const steps = STEPS_BY_JOB_TYPE[jobType];
  const matchedIndex = steps.findIndex((step) => step.statuses.includes(status));
  // A cancelled ticket has no "current" step on the happy-path timeline.
  const currentIndex = status === 'cancelled' ? -1 : matchedIndex;

  return (
    <ol aria-label="Status" className="flex items-start justify-between gap-1">
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isComplete = currentIndex !== -1 && index < currentIndex;
        return (
          <li
            key={step.key}
            aria-current={isCurrent ? 'step' : undefined}
            className="flex flex-1 flex-col items-center gap-1.5 text-center"
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-2.5 w-2.5 rounded-full motion-safe:transition-colors motion-safe:duration-200',
                isCurrent ? 'bg-primary-500' : isComplete ? 'bg-primary-300' : 'bg-border'
              )}
            />
            <span
              className={cn(
                'text-ui-xs',
                isCurrent
                  ? 'font-semibold text-primary-600'
                  : isComplete
                    ? 'text-text-secondary'
                    : 'text-text-tertiary'
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
