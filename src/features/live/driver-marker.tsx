/**
 * Builds the DOM element for a driver marker on the live map. Plain DOM, not a React component —
 * Mapbox GL `Marker` owns its element imperatively (`new mapboxgl.Marker({ element })`); mounting
 * a React tree into it would need a portal for no benefit, since the marker has no interactive
 * React state of its own (`live-map.tsx` updates position/rotation directly via the `Marker`
 * instance, not by re-rendering this element).
 *
 * A small colored dot with a heading wedge, drawn pointing "up" (north) in the marker's own local
 * space — `Marker#setRotation(heading)` (called by `live-map.tsx`) rotates the whole element to
 * point the wedge toward the driver's actual heading, so this function only ever builds the
 * static, unrotated shape.
 *
 * Fix round 1 (Minor, task-3-review.md): two gaps in the original version. (1) `role="img"` told
 * assistive tech this was non-interactive content while `live-map.tsx` was attaching a `click`
 * listener to it — contradictory, and gave keyboard users no way to reach it at all (mouse/touch
 * only). Now `role="button"` + `tabindex="0"`, with the actual activation (click AND
 * Enter/Space keydown) wired by `live-map.tsx`, which owns `onSelectTicketRef` — this function
 * only builds the static DOM/attributes, not behavior. (2) the element itself was 28×28px, short
 * of this workspace's 44×44px minimum touch-target rule. The OUTER element (what Mapbox anchors
 * and what `live-map.tsx` attaches listeners to) is now a 44×44px flex-centered hit area with the
 * 28×28px visual dot/wedge centered inside it unchanged — satisfies the touch-target rule without
 * inflating the marker's visible size on the map (a 44px dot per driver would clutter a map with
 * more than a couple of active jobs). Centering keeps Mapbox's default center-anchor landing on
 * the visual dot's actual center, not the hit area's.
 */
const SVG_NS = 'http://www.w3.org/2000/svg';

export function createDriverMarkerElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Driver on an active job — view ticket');
  el.style.width = '44px';
  el.style.height = '44px';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.cursor = 'pointer';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '9');
  circle.setAttribute('fill', '#ab6034');
  circle.setAttribute('stroke', 'white');
  circle.setAttribute('stroke-width', '2');

  const wedge = document.createElementNS(SVG_NS, 'path');
  wedge.setAttribute('d', 'M12 4.5 L15.2 12.5 L12 10.5 L8.8 12.5 Z');
  wedge.setAttribute('fill', 'white');

  svg.appendChild(circle);
  svg.appendChild(wedge);
  el.appendChild(svg);
  return el;
}
