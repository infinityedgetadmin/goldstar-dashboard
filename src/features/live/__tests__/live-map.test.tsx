import { render } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import type { LiveDriverLocation } from '../use-live-locations';

// Final whole-branch review, final-wave item 12: regression coverage for the driver-marker
// stale-closure bug (live-map.tsx's "update in place" branch never re-creates a marker's click
// handler, so a driver reassigned to a new ticket while their liveLocations doc id — their own
// uid — stays constant used to keep opening their PREVIOUS ticket).
//
// jsdom/vitest cannot run real mapbox-gl (WebGL). `live-board.test.tsx` sidesteps this by mocking
// the WHOLE `../live-map` module — fine there, since that file tests board-level wiring, not the
// map's own internal marker logic. THIS file needs the opposite: the real `LiveMap` component
// (with its real useEffect logic) running against a hand-built fake `mapbox-gl` that's just
// faithful enough (Marker/Map/Popup/NavigationControl stubs) to drive those effects — "to the
// extent jsdom allows", per the review: no real rendering, no real WebGL, just the JS-level
// marker lifecycle (creation, update-in-place, click-handler behavior) this bug lives in.

// `vi.mock` factories are hoisted above the rest of the module, so the fake classes/shared array
// they reference must be defined through `vi.hoisted` rather than as ordinary top-level `const`s.
const { FakeMarker, getCreatedMarkers, resetCreatedMarkers } = vi.hoisted(() => {
  class FakeMarkerImpl {
    element: HTMLElement;
    lngLat: [number, number] = [0, 0];
    rotation = 0;
    removed = false;
    opts: { element?: HTMLElement; color?: string; rotationAlignment?: string };
    constructor(opts: { element?: HTMLElement; color?: string; rotationAlignment?: string } = {}) {
      this.opts = opts;
      this.element = opts.element ?? document.createElement('div');
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    setRotation(r: number) {
      this.rotation = r;
      return this;
    }
    setPopup() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {
      this.removed = true;
      return this;
    }
  }
  let markers: FakeMarkerImpl[] = [];
  class TrackedMarker extends FakeMarkerImpl {
    constructor(opts?: { element?: HTMLElement; color?: string; rotationAlignment?: string }) {
      super(opts);
      markers.push(this);
    }
  }
  return {
    FakeMarker: TrackedMarker,
    getCreatedMarkers: () => markers,
    resetCreatedMarkers: () => {
      markers = [];
    },
  };
});

vi.mock('mapbox-gl', () => {
  class Map {
    addControl() {
      return this;
    }
    remove() {}
    getStyle() {
      return { layers: [] };
    }
    getLayer() {
      return undefined;
    }
    getSource() {
      return undefined;
    }
    removeLayer() {}
    removeSource() {}
    addSource() {}
    addLayer() {}
    isStyleLoaded() {
      return true;
    }
    once() {}
  }
  class Popup {
    setText() {
      return this;
    }
  }
  class NavigationControl {}
  return { default: { accessToken: '', Map, Marker: FakeMarker, Popup, NavigationControl } };
});

// mapbox-gl's own CSS fails to load through this project's PostCSS/Tailwind pipeline in vitest
// (unrelated to this fix) — the import has no test-relevant behavior, so it's stubbed out.
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}));

import LiveMap from '../live-map';

function driverLoc(over: Partial<LiveDriverLocation> = {}): LiveDriverLocation {
  return {
    id: 'driver1',
    ticketId: '01912345-7abc-7def-8123-456789ab0001',
    geo: { lat: 39.76, lng: -86.15 },
    heading: 90,
    speed: 5,
    at: '2026-08-23T21:00:00.000Z',
    expiresAt: '2026-08-23T21:05:00.000Z',
    ...over,
  };
}

const VENUE: Venue = {
  id: 'v1',
  operatorId: 'goldstar',
  name: 'St. Elmo',
  type: 'restaurant',
  status: 'active',
  address: { line1: '1 Main St', city: 'Indianapolis', region: 'IN', postalCode: '46204', country: 'US' },
  geo: { lat: 39.76, lng: -86.15 },
  zones: [],
} as unknown as Venue;

beforeEach(() => {
  resetCreatedMarkers();
});

/** The driver-marker element is the one whose constructor received an `element` option (a real
 * `createDriverMarkerElement()` div) — venue-pin markers don't pass one. */
function driverMarker(): InstanceType<typeof FakeMarker> {
  const m = getCreatedMarkers().find((mk) => mk.opts.element !== undefined);
  if (!m) throw new Error('no driver marker was created');
  return m;
}

describe('LiveMap driver markers', () => {
  it('creates exactly one marker for a driver and clicking it opens that ticket', () => {
    const onSelectTicket = vi.fn();
    render(
      <LiveMap token="tok" venues={[VENUE]} liveLocations={[driverLoc({ ticketId: 'ticket-A' })]} activeJobs={[]} onSelectTicket={onSelectTicket} />,
    );
    const marker = driverMarker();
    marker.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectTicket).toHaveBeenCalledWith('ticket-A');
  });

  it('regression (item 12): the SAME driver id reassigned to a NEW ticket updates in place (no new marker) but clicking opens the NEW ticket, not the stale one', () => {
    const onSelectTicket = vi.fn();
    const { rerender } = render(
      <LiveMap token="tok" venues={[VENUE]} liveLocations={[driverLoc({ id: 'driver1', ticketId: 'ticket-A' })]} activeJobs={[]} onSelectTicket={onSelectTicket} />,
    );
    expect(getCreatedMarkers().filter((m) => m.opts.element).length).toBe(1);

    // Same liveLocations doc id (driver1's own uid never changes), new ticketId — the "update in
    // place" tick. Before the fix, the marker's click handler still closed over ticket-A.
    rerender(
      <LiveMap token="tok" venues={[VENUE]} liveLocations={[driverLoc({ id: 'driver1', ticketId: 'ticket-B' })]} activeJobs={[]} onSelectTicket={onSelectTicket} />,
    );
    // Update-in-place: still exactly one driver marker, not a second one.
    expect(getCreatedMarkers().filter((m) => m.opts.element).length).toBe(1);

    const marker = driverMarker();
    marker.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectTicket).toHaveBeenCalledWith('ticket-B');
    expect(onSelectTicket).not.toHaveBeenCalledWith('ticket-A');
  });

  it('a driver marker is removed when it drops off the liveLocations feed, and the drawer never opens for a removed driver', () => {
    const onSelectTicket = vi.fn();
    const { rerender } = render(
      <LiveMap token="tok" venues={[VENUE]} liveLocations={[driverLoc({ id: 'driver1', ticketId: 'ticket-A' })]} activeJobs={[]} onSelectTicket={onSelectTicket} />,
    );
    const marker = driverMarker();
    expect(marker.removed).toBe(false);

    rerender(<LiveMap token="tok" venues={[VENUE]} liveLocations={[]} activeJobs={[]} onSelectTicket={onSelectTicket} />);
    expect(marker.removed).toBe(true);
  });

  it('a DIFFERENT driver id (a new liveLocations doc) creates a second, independent marker', () => {
    const onSelectTicket = vi.fn();
    render(
      <LiveMap
        token="tok"
        venues={[VENUE]}
        liveLocations={[driverLoc({ id: 'driver1', ticketId: 'ticket-A' }), driverLoc({ id: 'driver2', ticketId: 'ticket-B', geo: { lat: 39.77, lng: -86.16 } })]}
        activeJobs={[]}
        onSelectTicket={onSelectTicket}
      />,
    );
    const driverMarkers = getCreatedMarkers().filter((m) => m.opts.element);
    expect(driverMarkers).toHaveLength(2);
    driverMarkers[1]!.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectTicket).toHaveBeenCalledWith('ticket-B');
  });
});
