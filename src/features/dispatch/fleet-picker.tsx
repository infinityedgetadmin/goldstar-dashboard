'use client';
import type { FleetVehicle } from '@goldstar/platform';
import { Text } from '@/components/ui/typography';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface FleetPickerProps {
  label: string;
  vehicles: FleetVehicle[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  /** Ride requires an accessible vehicle when `ticket.ride.accessible` — mirrors
   * `dispatchAssign`'s own `wantsAccessible`/`hasFleetVehicle` check. Non-accessible vehicles are
   * greyed (not hidden) when set. */
  accessibleOnly?: boolean;
  /** drive_home's chase vehicle is optional — renders a "No chase vehicle" option that clears the
   * selection. Omit for passenger_ride, where a vehicle is required. */
  allowNone?: boolean;
}

const STATUS_LABEL: Record<FleetVehicle['status'], string> = {
  available: 'Available',
  in_use: 'In use',
  maintenance: 'Maintenance',
  retired: 'Retired',
};

/**
 * Fleet vehicle list for the dispatch assign dialog (Plan 5 Task 4): mirrors `dispatchAssign`'s own
 * availability check (`fleetVehicle.status === 'available'`, plus `accessible` when the ride
 * requires it) — unavailable/ineligible rows greyed with a reason rather than hidden, same pattern
 * as `driver-picker.tsx`.
 */
export function FleetPicker({ label, vehicles, value, onChange, accessibleOnly = false, allowNone = false }: FleetPickerProps) {
  return (
    <div className="space-y-2">
      <Text as="span" size="sm" weight="medium">
        {label}
      </Text>
      <div role="radiogroup" aria-label={label} className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {allowNone ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === undefined}
            onClick={() => onChange(undefined)}
            className={cn(
              'flex min-h-11 w-full items-center rounded-md px-3 text-left text-body-sm transition-colors',
              value === undefined ? 'bg-primary-50 text-primary-700' : 'text-text-secondary hover:bg-bg-secondary'
            )}
          >
            No chase vehicle
          </button>
        ) : null}
        {vehicles.length === 0 ? (
          <Text size="sm" color="tertiary" className="px-3 py-2">
            No vehicles in the fleet.
          </Text>
        ) : (
          vehicles.map((vehicle) => {
            const unavailable = vehicle.status !== 'available';
            const inaccessible = accessibleOnly && !vehicle.accessible;
            const disabled = unavailable || inaccessible;
            const selected = vehicle.id === value;
            const reason = unavailable ? STATUS_LABEL[vehicle.status] : inaccessible ? 'Not accessible' : undefined;
            return (
              <button
                key={vehicle.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                title={reason}
                onClick={() => onChange(vehicle.id)}
                className={cn(
                  'flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-body-sm transition-colors',
                  selected && !disabled ? 'bg-primary-50 text-primary-700' : 'text-text-primary hover:bg-bg-secondary',
                  disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                )}
              >
                <span className="truncate">
                  {vehicle.plate} · {vehicle.color} {vehicle.make} {vehicle.model}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {vehicle.accessible ? (
                    <Badge size="sm" variant="info">
                      Accessible
                    </Badge>
                  ) : null}
                  {reason ? (
                    <Text as="span" size="xs" color="tertiary">
                      {reason}
                    </Text>
                  ) : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
