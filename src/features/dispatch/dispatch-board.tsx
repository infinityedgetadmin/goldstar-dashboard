"use client";
import { useMemo } from "react";
import type {
  FleetVehicle,
  Ticket,
  TicketStatus,
  User,
} from "@goldstar/platform";
import { useCollection } from "@/lib/firebase/hooks";
import { EmptyState } from "@/components/ui/empty-state";
import { Text } from "@/components/ui/typography";
import { useJobs } from "./use-jobs";
import { JobCard } from "./job-card";

interface Column {
  key: string;
  label: string;
  statuses: readonly TicketStatus[];
}

/**
 * Board columns per task-4-brief.md: Requested/Quoted (awaiting the guest) | Confirmed (needs
 * assignment — carries the SLA timer the brief calls out explicitly) | Assigned/En-route | In
 * transit | Arrived/Completing. Covers every status in `use-jobs.ts`'s `ACTIVE_JOB_STATUSES`
 * exactly once — the full non-terminal drive_home/passenger_ride status set.
 */
const COLUMNS: Column[] = [
  {
    key: "requested",
    label: "Requested / Quoted",
    statuses: ["requested", "quoted"],
  },
  { key: "confirmed", label: "Confirmed", statuses: ["confirmed"] },
  {
    key: "assigned",
    label: "Assigned / En route",
    statuses: [
      "assigned",
      "en_route_to_guest",
      "en_route_to_pickup",
      "arrived_pickup",
    ],
  },
  {
    key: "in_transit",
    label: "In transit",
    statuses: ["pre_drive_inspection", "in_transit"],
  },
  {
    key: "arrived",
    label: "Arrived / Completing",
    statuses: ["arrived", "completed"],
  },
];

export interface DispatchBoardProps {
  operatorId: string;
}

/**
 * Dispatch board (Plan 5 Task 4): live drive_home/passenger_ride jobs (`use-jobs.ts`), grouped into
 * the five columns above, each rendered as `JobCard`s carrying the assign/re-quote/cancel actions.
 * Drivers and fleet vehicles are fetched once here and threaded down — same "fetch at the board,
 * pass down" shape `live-board.tsx` uses for its own `staff`/`venues` props, so every card/dialog
 * shares one live listener per collection instead of one each.
 */
export function DispatchBoard({ operatorId }: DispatchBoardProps) {
  const { jobs, loading } = useJobs(operatorId);
  const { data: staff } = useCollection<User>(`operators/${operatorId}/users`);
  const { data: vehicles } = useCollection<FleetVehicle>(
    `operators/${operatorId}/fleetVehicles`,
  );

  const drivers = useMemo(
    () => staff.filter((u) => u.roles.includes("driver")),
    [staff],
  );
  const staffByUid = useMemo(
    () => new Map(staff.map((u) => [u.uid, u])),
    [staff],
  );

  const jobsByColumn = useMemo(() => {
    const out: Record<string, Ticket[]> = {};
    for (const column of COLUMNS) {
      out[column.key] = jobs.filter((j) =>
        (column.statuses as readonly string[]).includes(j.status),
      );
    }
    return out;
  }, [jobs]);

  if (loading) {
    return (
      <Text size="sm" color="tertiary">
        Loading dispatch board…
      </Text>
    );
  }

  if (jobs.length === 0) {
    return (
      <EmptyState
        title="No active jobs"
        description="Drive-home and ride requests will show up here as guests request them."
      />
    );
  }

  // The five columns share the page width (fixed 288px columns came to 1,504px with gaps, wider
  // than the content area beside the sidebar on a 1440px screen). Below the 12rem floor the board
  // scrolls sideways rather than squeezing cards.
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid grid-cols-[repeat(5,minmax(12rem,1fr))] gap-4">
        {COLUMNS.map((column) => {
          const columnJobs = jobsByColumn[column.key] ?? [];
          return (
            <div
              key={column.key}
              data-testid={`dispatch-column-${column.key}`}
              className="flex min-w-0 flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <Text size="sm" weight="semibold">
                  {column.label}
                </Text>
                <Text size="xs" color="tertiary">
                  {columnJobs.length}
                </Text>
              </div>
              <div className="flex flex-col gap-2">
                {columnJobs.length === 0 ? (
                  <Text size="xs" color="tertiary">
                    None
                  </Text>
                ) : (
                  columnJobs.map((ticket) => (
                    <JobCard
                      key={ticket.id}
                      ticket={ticket}
                      drivers={drivers}
                      vehicles={vehicles}
                      staffByUid={staffByUid}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
