import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import '../globals.css';

/**
 * Root layout for the GUEST chunk graph (Plan 4a Task 7, Ruling D). Was
 * previously a nested layout under the single `src/app/layout.tsx`
 * root, inheriting the dashboard's `Providers` (React Query, Sonner)
 * even though no guest code uses either — see
 * `scripts/check-guest-bundle.mjs` for the budget this was costing.
 * Next.js supports multiple root layouts via route groups; this one is
 * deliberately minimal — no `Providers`, no dashboard fonts — so the
 * dashboard's chunk graph never reaches `/t/[token]` or
 * `/pay/[venueToken]`. `globals.css` (Tailwind + `src/styles/tokens.css`)
 * is shared with the dashboard root (`(app)/layout.tsx`) since CSS
 * doesn't affect the JS bundle budget this split exists to protect.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-display' });
export const metadata: Metadata = { title: 'Your valet ticket', robots: { index: false, follow: false } };
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // `gs-public` scopes the token overrides emitted at the bottom of
  // src/styles/tokens.css (see scripts/generate-tokens-css.mjs) — it makes
  // the platform's design tokens win over the dashboard theme's colliding
  // CSS custom properties for everything under this layout. See
  // task-1-report.md, "Ruling E fix".
  return (
    <html lang="en">
      <body
        className={`gs-public ${inter.variable} ${cormorant.variable} min-h-dvh bg-bg-secondary font-sans text-text-primary antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
