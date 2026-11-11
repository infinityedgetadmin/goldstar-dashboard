'use client';
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Venue } from '@goldstar/platform';
import { firebase } from '@/lib/firebase/client';

/**
 * Normalizes the raw `venueIds` custom claim into the ordered, de-duplicated
 * list of venue IDs this session may act on.
 *
 * SECURITY: this — and only this — is where the venue portal's venue list
 * comes from. It is deliberately NOT derived from the operator's `venues`
 * collection: `firestore.rules`' `venues` *list* rule admits any
 * `venue_user` of the operator (it can't evaluate per-document
 * `venueIds` membership on a collection query), so a client-side
 * `useCollection('operators/{op}/venues')` would happily hand a restaurant
 * host the name of every other venue the operator runs. Reading each
 * claimed venue as an individual document instead means the *get* rule
 * (`venueId in venueIds()`) is the server-side backstop for exactly the
 * same set this function computes.
 *
 * Exported standalone so that property is directly testable without
 * mounting a component or a Firestore mock.
 */
export function claimVenueIds(venueIds: readonly string[] | undefined): string[] {
  if (!venueIds) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of venueIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export interface ClaimVenuesResult {
  /** Claimed venues that actually resolved to a readable document, in claim order. */
  venues: Venue[];
  /** True until every claimed ID has produced a snapshot (or an error). */
  loading: boolean;
}

/**
 * Structural deep-equality over plain Firestore snapshot data (objects, arrays, primitives) —
 * used by the Ruling G identity preservation in `useClaimVenues`'s `publish` below. Deliberately
 * NOT `JSON.stringify(a) === JSON.stringify(b)`: stringify is key-order-sensitive, and Firestore
 * gives no ordering guarantee for a deserialized document's keys across emissions, so two
 * identical documents could stringify differently and silently defeat the whole point.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  if (aKeys.length !== Object.keys(bRecord).length) return false;
  return aKeys.every((k) => k in bRecord && deepEqual(aRecord[k], bRecord[k]));
}

interface State {
  byId: Record<string, Venue>;
  settled: boolean;
}

const IDLE: State = { byId: {}, settled: true };

/**
 * Live-subscribes to each venue named in the session's `venueIds` claim.
 *
 * One `onSnapshot` per claimed venue rather than a single collection query —
 * see `claimVenueIds` above for why that's the security-relevant choice, not
 * just a stylistic one. A claimed venue whose document is missing or
 * unreadable is simply omitted from `venues` (never surfaced as an error to
 * the user); the rest of the portal keeps working.
 */
export function useClaimVenues(
  operatorId: string | undefined,
  venueIds: readonly string[] | undefined
): ClaimVenuesResult {
  // A referentially-stable id list: `venueIds` is a fresh array on some
  // renders, and an unstable dependency here would re-subscribe (and
  // re-`setState`) every render — the same infinite-loop trap documented on
  // `useCollection`'s `EMPTY_CONSTRAINTS` in `src/lib/firebase/hooks.ts`.
  const key = claimVenueIds(venueIds).join('|');
  const ids = useMemo(() => (key ? key.split('|') : []), [key]);

  const willSubscribe = Boolean(operatorId) && ids.length > 0;
  const [state, setState] = useState<State>(() => (willSubscribe ? { byId: {}, settled: false } : IDLE));

  // Resets DURING render when the subscription target changes, rather than
  // from inside the effect below (which doesn't run until after this render
  // commits) — the same pattern, for the same reason, as `useDoc`'s
  // `subscribedPath` in `src/lib/firebase/hooks.ts`: without it, the render
  // that follows a claim change would hand back the PREVIOUS claim's
  // already-settled venues for one frame. React's documented
  // reset-state-on-prop-change idiom: it discards this render and re-renders
  // with the reset state before anything paints.
  const target = `${operatorId ?? ''}#${key}`;
  const [subscribedTarget, setSubscribedTarget] = useState(target);
  if (target !== subscribedTarget) {
    setSubscribedTarget(target);
    setState(willSubscribe ? { byId: {}, settled: false } : IDLE);
  }

  useEffect(() => {
    if (!operatorId || ids.length === 0) return;

    const { db } = firebase();
    const pending = new Set(ids);

    // Ruling G (T1a review nit, upgraded by the controller): a venue's OBJECT IDENTITY must be
    // stable per venue id across snapshots. `onSnapshot` re-emits (and `snap.data()` builds a
    // fresh object) on the initial connect, on server touches that don't change the fields this
    // portal reads, and on unrelated-field writes — before this, every emission minted a new
    // `Venue` object, so `useVenue().venue` was a fresh reference each time and any downstream
    // effect with `venue` in its deps (five more Plan 7 tasks are about to write exactly those)
    // would re-fire on every heartbeat: a render/subscription loop factory. The functional
    // update below keeps the EXISTING object whenever the incoming data is deep-equal, and
    // returns `prev` untouched when nothing at all changed — so `state.byId` (and therefore the
    // `venues` memo and each element's identity) only ever moves when a venue's content really
    // did. A genuine change (rename, rate edit) still mints a new object — identity tracks
    // content, per id.
    //
    // N3 (T1b re-review): this is now a CORRECTNESS dependency, not an optimization. Three
    // venue-portal screens (validations-panel/venue-invoices/staffing-view) memoize their
    // `useCollection` constraints on `[venue]`, and `useCollection` resets+resubscribes during
    // any render whose constraints identity changed (the MAJOR-1 render-phase reset). Losing
    // stable venue identity here no longer means mere churn — it means those screens LOOP:
    // every snapshot re-emission would mint a new `venue`, new constraints, a reset, a
    // resubscription, and a fresh emission. Do not "simplify" this away; the matching note
    // sits at each of those constraints memos.
    const publish = (id: string, incoming: Venue | undefined) => {
      pending.delete(id);
      const settled = pending.size === 0;
      setState((prev) => {
        const existing = prev.byId[id];
        const next = incoming !== undefined && existing !== undefined && deepEqual(existing, incoming) ? existing : incoming;
        const byIdUnchanged = next === existing && (next !== undefined || !(id in prev.byId));
        if (byIdUnchanged && prev.settled === settled) return prev;
        if (byIdUnchanged) return { byId: prev.byId, settled };
        const byId = { ...prev.byId };
        if (next !== undefined) byId[id] = next;
        else delete byId[id];
        return { byId, settled };
      });
    };

    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, `operators/${operatorId}/venues/${id}`),
        (snap) => publish(id, snap.exists() ? ({ id: snap.id, ...snap.data() } as Venue) : undefined),
        () => publish(id, undefined)
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [operatorId, ids]);

  const venues = useMemo(
    () => ids.map((id) => state.byId[id]).filter((v): v is Venue => Boolean(v)),
    [ids, state.byId]
  );

  return { venues, loading: !state.settled };
}
