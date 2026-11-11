'use client';
import { useEffect, useRef } from 'react';
import mapboxgl, { type GeoJSONSource, type Map as MapboxMap, type Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Ticket, Venue } from '@goldstar/platform';
import { createDriverMarkerElement } from './driver-marker';
import { decodePolyline } from './polyline';
import type { LiveDriverLocation } from './use-live-locations';

export interface LiveMapProps {
  token: string;
  venues: Venue[];
  liveLocations: LiveDriverLocation[];
  /** drive_home/passenger_ride tickets currently in flight (a `driveHome.route`/`ride.route`
   * present) — drawn as polylines. */
  activeJobs: Ticket[];
  onSelectTicket: (ticketId: string) => void;
}

const FALLBACK_CENTER: [number, number] = [-86.1581, 39.7684]; // Indianapolis — this operator's home market
const ROUTE_COLOR = '#ffc30c'; // brand gold, per this workspace's palette
const VENUE_PIN_COLOR = '#ab6034'; // brand bronze/terracotta

function ticketRoute(t: Ticket): string | undefined {
  return t.driveHome?.route ?? t.ride?.route;
}

/**
 * The live-ops map: venue pins, driver markers (heading-rotated, click -> ticket drawer via
 * `onSelectTicket`), and active-job route polylines. Rendered only via
 * `dynamic(() => import('./live-map'), { ssr: false })` from `live-board.tsx`, and only once a
 * `NEXT_PUBLIC_MAPBOX_PUBLIC_TOKEN` is configured — `mapboxgl` is a genuinely heavy dependency, so
 * neither this module nor its CSS is ever requested by a viewer who never opens a page that
 * renders `<LiveMap>` (see `live-board.tsx`'s header comment for the token-gate/bundle reasoning).
 */
export default function LiveMap({ token, venues, liveLocations, activeJobs, onSelectTicket }: LiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const venueMarkersRef = useRef<MapboxMarker[]>([]);
  const driverMarkersRef = useRef<Map<string, MapboxMarker>>(new Map());
  // Final whole-branch review, final-wave item 12: the driver's CURRENT ticketId, read fresh by the
  // marker's click handler instead of the `loc.ticketId` it closed over at marker-CREATION time —
  // see the "update in place" branch below for why a closure alone goes stale.
  const driverTicketIdRef = useRef<Map<string, string>>(new Map());
  const onSelectTicketRef = useRef(onSelectTicket);
  useEffect(() => {
    onSelectTicketRef.current = onSelectTicket;
  });

  // Map instance — created once per mount.
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;
    const initialCenter = venues[0] ? ([venues[0].geo.lng, venues[0].geo.lat] as [number, number]) : FALLBACK_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: 11,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the map is created once; token/initial center don't change for a mounted board
  }, []);

  // Venue pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    venueMarkersRef.current.forEach((m) => m.remove());
    venueMarkersRef.current = venues.map((v) =>
      new mapboxgl.Marker({ color: VENUE_PIN_COLOR })
        .setLngLat([v.geo.lng, v.geo.lat])
        .setPopup(new mapboxgl.Popup({ offset: 24 }).setText(v.name))
        .addTo(map),
    );
  }, [venues]);

  // Driver markers — updated in place when an id already has a marker (avoids a remove/re-add
  // flicker on every liveLocations tick), removed when a driver drops off the feed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    liveLocations.forEach((loc) => {
      seen.add(loc.id);
      // Final whole-branch review, final-wave item 12: keep the live ticketId current on EVERY
      // tick — both the "update in place" branch below and a brand-new marker rely on this being
      // fresh by the time a click fires.
      driverTicketIdRef.current.set(loc.id, loc.ticketId);
      const existing = driverMarkersRef.current.get(loc.id);
      if (existing) {
        // Bug (final whole-branch review, item 12): this branch updates position/rotation in place
        // — deliberately, to avoid a remove/re-add flicker on every tick (see the comment above this
        // effect) — but a mapbox-gl `Marker`'s DOM element and its event listeners are NOT recreated
        // here. If the SAME driver (same `loc.id`, e.g. finishes one ticket and picks up a new one
        // while their live-location doc id — their own uid — stays constant) gets a NEW `ticketId`
        // on a later tick, the click handler bound at marker-creation time below closed over the
        // OLD `loc` object and would keep opening the driver's PREVIOUS ticket forever. The handler
        // reads `driverTicketIdRef.current` at CLICK time instead of the creation-time closure, so
        // it always opens whichever ticket this driver is on right now — no marker recreation
        // needed, so the flicker-avoidance this branch exists for is untouched.
        existing.setLngLat([loc.geo.lng, loc.geo.lat]).setRotation(loc.heading);
        return;
      }
      const el = createDriverMarkerElement();
      const marker = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
        .setLngLat([loc.geo.lng, loc.geo.lat])
        .setRotation(loc.heading)
        .addTo(map);
      const activate = () => onSelectTicketRef.current(driverTicketIdRef.current.get(loc.id) ?? loc.ticketId);
      el.addEventListener('click', activate);
      // Fix round 1 (Minor, task-3-review.md): `driver-marker.tsx` now sets `role="button"` +
      // `tabindex="0"` on this element but builds no behavior itself — Enter/Space is the
      // keyboard-equivalent activation for a `role="button"` element (native `<button>`s get this
      // from the browser for free; a `div` with `role="button"` does not), wired here alongside
      // the click listener since this effect is what owns `onSelectTicketRef`.
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });
      driverMarkersRef.current.set(loc.id, marker);
    });
    for (const [id, marker] of driverMarkersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        driverMarkersRef.current.delete(id);
        driverTicketIdRef.current.delete(id);
      }
    }
  }, [liveLocations]);

  // Active-job route polylines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const activeIds = new Set(activeJobs.map((t) => `route-${t.id}`));
      const existingRouteLayers = map.getStyle()?.layers?.filter((l) => l.id.startsWith('route-')) ?? [];
      for (const layer of existingRouteLayers) {
        if (!activeIds.has(layer.id)) {
          if (map.getLayer(layer.id)) map.removeLayer(layer.id);
          if (map.getSource(layer.id)) map.removeSource(layer.id);
        }
      }

      activeJobs.forEach((t) => {
        const route = ticketRoute(t);
        if (!route) return;
        const coordinates = decodePolyline(route);
        const sourceId = `route-${t.id}`;
        const geojson: GeoJSON.Feature<GeoJSON.LineString> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
        } else {
          map.addSource(sourceId, { type: 'geojson', data: geojson });
          map.addLayer({ id: sourceId, type: 'line', source: sourceId, layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': ROUTE_COLOR, 'line-width': 4 } });
        }
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [activeJobs]);

  return <div ref={containerRef} className="h-full w-full rounded-lg" role="application" aria-label="Live operations map" />;
}
