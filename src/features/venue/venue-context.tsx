'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Venue } from '@goldstar/platform';

export interface VenueContextValue {
  /**
   * Venues this session may act on, in claim order. Populated only from the
   * `venueIds` custom claim — see `use-claim-venues.ts`.
   */
  venues: Venue[];
  /**
   * The venue every venue-portal screen is scoped to. `undefined` only while
   * venues are still loading, or when the claim grants none.
   */
  venue: Venue | undefined;
  venueId: string | undefined;
  /** Switches the active venue. Ignores any ID outside `venues`. */
  setVenueId: (id: string) => void;
  loading: boolean;
}

const VenueContext = createContext<VenueContextValue | null>(null);

/**
 * Reads the venue-portal shell's active venue. Must be used under
 * `<VenueProvider>` — i.e. anywhere inside `src/app/(app)/(venue)`.
 *
 * Every venue-portal query MUST scope itself with `venue.id` from here
 * rather than taking a venue ID from a URL param or a user-supplied value:
 * this value is guaranteed to be one of the session's claimed venues (see
 * `VenueProvider` below), which is exactly the set `firestore.rules` will
 * allow through.
 *
 * Ruling G: `venue`'s object identity is stable per venue id — it only
 * changes when the venue document's CONTENT changes (`useClaimVenues`
 * preserves the existing object across content-identical snapshot
 * re-emissions), so `venue` is safe in an effect/memo dependency list.
 * Still prefer `venue.id` (a stable string) when the id is all the
 * dependent code actually needs — a rename shouldn't resubscribe a query
 * that only ever read the id.
 */
export function useVenue(): VenueContextValue {
  const ctx = useContext(VenueContext);
  if (!ctx) {
    throw new Error('useVenue() must be called within a <VenueProvider>.');
  }
  return ctx;
}

export interface VenueProviderProps {
  venues: Venue[];
  loading?: boolean;
  /**
   * `localStorage` key under which the active venue is remembered across
   * reloads. MUST be per-user — the layout derives it from the session uid —
   * so two accounts sharing a browser never inherit each other's selection.
   * Omit to keep the selection in memory only.
   */
  storageKey?: string;
  children: ReactNode;
}

/**
 * `localStorage` access, defensively wrapped. It throws outright in some
 * browser configurations (Safari private browsing, "block all cookies", a
 * sandboxed iframe), and a venue portal must not white-screen because a host
 * hardened their browser. Both helpers therefore fail silently: a read that
 * can't happen just means "no remembered venue" and the shell falls back to
 * the first claimed one.
 *
 * The `typeof window` guard covers Next's server prerender of this client
 * component. In practice the provider never renders on the server — the
 * session is always `loading` there, so the layout returns a skeleton — but
 * this must not depend on that staying true.
 */
function readStoredVenueId(key: string | undefined): string | undefined {
  if (!key || typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeStoredVenueId(key: string | undefined, id: string): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, id);
  } catch {
    // Remembering the selection is a convenience, never a requirement.
  }
}

/**
 * Holds the venue-portal shell's active-venue selection.
 *
 * Takes its `venues` as a prop rather than calling `useClaimVenues` itself,
 * so the selection logic is testable without a Firestore mock and so the
 * layout keeps a single subscription.
 *
 * SECURITY: the active venue is always resolved by *looking the selected ID
 * up in `venues`* (`find(...) ?? venues[0]`), never by trusting the stored
 * ID directly. A selection that no longer appears in the claim — because the
 * claim shrank underneath us, because a host was removed from a venue, or
 * because a value in `localStorage` was hand-edited — silently degrades to
 * the first claimed venue instead of leaking one the session may not see.
 * That resolution is what makes the persisted ID safe to read at all: it is
 * a *hint*, trusted no further than the claim already allows. `setVenueId`
 * additionally refuses unknown IDs, so neither state nor storage ever holds
 * one in the first place.
 */
export function VenueProvider({ venues, loading = false, storageKey, children }: VenueProviderProps) {
  const [selectedId, setSelectedId] = useState<string | undefined>(() => readStoredVenueId(storageKey));

  // Re-reads when the storage key changes — i.e. a different user's session
  // took over this provider without a remount. Render-phase reset for the
  // same reason `useClaimVenues` uses one: an effect wouldn't run until after
  // this render commits, leaving one frame showing the previous user's venue.
  const [keyInUse, setKeyInUse] = useState(storageKey);
  if (storageKey !== keyInUse) {
    setKeyInUse(storageKey);
    setSelectedId(readStoredVenueId(storageKey));
  }

  const setVenueId = useCallback(
    (id: string) => {
      if (!venues.some((v) => v.id === id)) return;
      writeStoredVenueId(storageKey, id);
      setSelectedId(id);
    },
    [venues, storageKey]
  );

  const value = useMemo<VenueContextValue>(() => {
    const venue = venues.find((v) => v.id === selectedId) ?? venues[0];
    return { venues, venue, venueId: venue?.id, setVenueId, loading };
  }, [venues, selectedId, setVenueId, loading]);

  return <VenueContext.Provider value={value}>{children}</VenueContext.Provider>;
}
