'use client';

import { useCallback, useEffect, useState } from 'react';

export type RequestRoute = 'drive-home' | 'ride' | null;

function readHash(): RequestRoute {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace(/^#/, '');
  return hash === 'drive-home' || hash === 'ride' ? hash : null;
}

/**
 * Small hash-based router for the guest ticket page's two request sheets.
 * `TicketView`'s "Drive me home"/"Request a ride" buttons set
 * `window.location.hash` directly (Task 2) rather than going through
 * Next.js routing — this hook is the other half: it reads the hash on
 * mount AND on every `hashchange` (a bare `window.location.hash` read only
 * at render time would miss a hash the browser restored on load, or a
 * back/forward navigation that changes the hash without any React state
 * update on its own), and exposes `close()` to clear it.
 *
 * `close()` uses `history.replaceState` rather than
 * `window.location.hash = ''` — assigning an empty hash pushes a new
 * history entry in some browsers, which would leave a "phantom" stop for
 * the back button every time a guest opens and dismisses a sheet.
 */
export function useHashRoute(): { route: RequestRoute; close: () => void } {
  const [route, setRoute] = useState<RequestRoute>(() => readHash());

  useEffect(() => {
    const onHashChange = () => setRoute(readHash());
    onHashChange(); // covers a hash set between this component's initial render and this effect mounting
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const close = useCallback(() => {
    const { pathname, search } = window.location;
    window.history.replaceState(null, '', pathname + search);
    setRoute(null);
  }, []);

  return { route, close };
}
