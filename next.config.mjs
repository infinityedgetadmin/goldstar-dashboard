/**
 * Plain JavaScript on purpose, not `next.config.ts`.
 *
 * `next start` reads this file at RUNTIME. A `.ts` config makes Next require `typescript` in the
 * running container, and a production image installs production dependencies only — so Next
 * announced "Installing TypeScript as it was not found while loading next.config.ts", failed
 * against the read-only filesystem, and the service answered 503 on every request. Local `next dev`
 * and `next build` never showed it, because TypeScript is present there as a devDependency.
 *
 * The JSDoc annotation keeps the same editor and `tsc` type-checking the TS version had.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  trailingSlash: false,

  /**
   * Stop the CDN from pinning a build for a year.
   *
   * Next gives a statically prerendered page `Cache-Control: s-maxage=31536000` when it has no
   * revalidate window (`getCacheControlHeader` in next/src/server/lib/cache-control.ts). Behind a
   * shared cache — Firebase Hosting's CDN here — that is a year, and because the HTML names
   * content-hashed JS chunks, a cached copy pins the entire client bundle: a deploy goes out, the
   * origin serves the new build, and browsers keep executing the old one. It cost two rounds of
   * "it's still showing the old page" on this project, first on `/` and then on `/sign-in`.
   *
   * Setting the header here is the supported override rather than a workaround: Next applies
   * `headers()` during routing, before the renderer, and `sendRenderResult` explicitly declines to
   * overwrite a `Cache-Control` that is already set ("If cache control is already set on the
   * response we don't override it to allow users to customize it via next.config").
   *
   * `must-revalidate` with `max-age=0` keeps the CDN and browser caches working — they still store
   * the response and revalidate with an ETag, so a repeat view is a cheap 304 — while guaranteeing
   * nobody is served a stale build. `_next/static` and `_next/image` are excluded so content-hashed
   * assets keep their own immutable caching, which is the part that should be cached hard.
   */
  async headers() {
    return [
      {
        source: '/((?!_next/static|_next/image).*)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
