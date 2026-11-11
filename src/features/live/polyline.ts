/**
 * Decodes a Google/Mapbox-format encoded polyline string into `[lng, lat]` pairs — the coordinate
 * order Mapbox GL's GeoJSON `LineString` expects. `driveHome.route`/`ride.route` are stamped by
 * `functions/src/modules/maps/mapbox.adapter.ts`'s `route()`, which requests
 * `geometries=polyline` from the Mapbox Directions API — precision 5, the algorithm's default and
 * this decoder's default.
 *
 * Small hand-rolled decoder rather than a new dependency (task-3-brief.md carry): the algorithm is
 * ~20 lines, unchanged since Google introduced it, and adding a package for this alone isn't worth
 * it on a page that's already pulling in `mapbox-gl` itself as the heavy dependency.
 */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const factor = Math.pow(10, precision);
  let index = 0;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}
