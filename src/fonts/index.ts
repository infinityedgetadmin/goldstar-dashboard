import localFont from 'next/font/local';

/**
 * Brand typefaces, served from this folder instead of fetched from Google at build time, so the
 * app builds and runs with no network. Both are under the SIL Open Font License (see the OFL-*.txt
 * files beside this module). Latin subset only.
 *
 * Next.js reads these calls at build time, so every option must be written inline as a literal.
 */

/** Dashboard root: exposes `--font-inter` / `--font-cormorant` (see globals.css). */
export const dashboardInter = localFont({
  src: [{ path: './inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-inter',
  display: 'swap',
});
export const dashboardCormorant = localFont({
  src: [
    { path: './cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './cormorant-garamond-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-cormorant',
  display: 'swap',
});

/** Guest root: sets `--font-sans` / `--font-display` directly. */
export const guestInter = localFont({
  src: [{ path: './inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' }],
  variable: '--font-sans',
  display: 'swap',
});
export const guestCormorant = localFont({
  src: [
    { path: './cormorant-garamond-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './cormorant-garamond-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});
