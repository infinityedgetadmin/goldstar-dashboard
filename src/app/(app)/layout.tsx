import type { Metadata } from 'next';
import { Inter, Cormorant_Garamond } from 'next/font/google';
import '../globals.css';
import { Providers } from '@/providers/providers';
import { brand } from '@/config/operators/brand';

/**
 * Root layout for the DASHBOARD chunk graph — everything except
 * `(public)`. Split out of the former single `src/app/layout.tsx` (Plan
 * 4a Task 7, Ruling D): Next.js supports multiple root layouts via route
 * groups, and this one is deliberately separate from `(public)`'s root
 * layout so the dashboard's `Providers` (React Query, Sonner) and
 * dashboard-only fonts never enter the guest surface's chunk graph.
 * Navigating between this root and `(public)`'s is a full page load —
 * acceptable, since the two surfaces never soft-navigate into each
 * other. See `src/app/(public)/layout.tsx` for the guest root and
 * `scripts/check-guest-bundle.mjs` for the budget this decouples.
 */
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const cormorant = Cormorant_Garamond({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-cormorant' });

// Plan 8 Task 15: the build-time operator brand (`NEXT_PUBLIC_OPERATOR`) names the tab — the
// signed-in operator's own branding takes over inside the shell (sidebar, theme vars).
export const metadata: Metadata = {
  title: { default: brand.displayName, template: `%s · ${brand.displayName}` },
  robots: { index: false },
};

export default function AppRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
