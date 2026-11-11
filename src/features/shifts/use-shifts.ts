'use client';
import { useMemo } from 'react';
import { where, type QueryConstraint } from 'firebase/firestore';
import type { ClockEvent, Shift } from '@goldstar/platform';
import { useCollection, type LiveListResult } from '@/lib/firebase/hooks';

/**
 * Live shifts for one venue in a `[weekStart, weekEnd]` (both `yyyy-MM-dd`, inclusive) window —
 * `onSnapshot`-only (this workspace's ledger constraint), matching `@goldstar/platform`'s `QUERIES`
 * registry entry `venueShifts: { collection: 'shifts', fields: ['venueId', 'date'] }` (equality on
 * `venueId` + range on `date`, same composite index that registry entry already generates).
 */
export function useVenueShifts(operatorId: string | undefined, venueId: string | undefined, weekStart: string, weekEnd: string): LiveListResult<Shift> {
  const constraints = useMemo<QueryConstraint[]>(
    () => (venueId ? [where('venueId', '==', venueId), where('date', '>=', weekStart), where('date', '<=', weekEnd)] : []),
    [venueId, weekStart, weekEnd],
  );
  return useCollection<Shift>(operatorId && venueId ? `operators/${operatorId}/shifts` : undefined, constraints);
}

/** Live clock-event timeline for one shift (the `clockEvents` subcollection). */
export function useShiftClockEvents(operatorId: string | undefined, shiftId: string | undefined): LiveListResult<ClockEvent> {
  return useCollection<ClockEvent>(operatorId && shiftId ? `operators/${operatorId}/shifts/${shiftId}/clockEvents` : undefined);
}
