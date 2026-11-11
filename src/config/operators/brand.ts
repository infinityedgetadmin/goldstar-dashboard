/**
 * Build-time operator brand (Plan 8 Task 15, white-label dashboard).
 *
 * The dashboard is multi-tenant at RUNTIME — every screen reads the signed-in operator's own
 * `branding` from its Firestore doc (`operatorThemeVars`, the sidebar's display name). What that
 * cannot cover is everything rendered BEFORE a session exists or outside React: the `<title>`
 * template, the sign-in and accept-invite copy, the root placeholder page. Those come from the
 * brand selected at build time by `NEXT_PUBLIC_OPERATOR` (default `goldstar`), one build per
 * hosting target (`firebase.json` → `hosting[].target`, `.firebaserc` → `targets`).
 *
 * Adding an operator: a new file next to `goldstar.ts`/`demo.ts`, an entry in `BRANDS`, a hosting
 * target + site in `firebase.json`/`.firebaserc`, and the matching `config/operators/<slug>.json`
 * in goldstar-mobile.
 */
export interface OperatorBrand {
  /** `NEXT_PUBLIC_OPERATOR` value and the mobile `OPERATOR` value — the build selector. */
  slug: string;
  /** `operators/{id}` — the tenant this build fronts by default. */
  operatorId: string;
  displayName: string;
  primaryColor: string;
  accentColor: string;
  supportPhone: string;
  /** `firebase.json` hosting target this build deploys to (`firebase deploy --only hosting:<target>`). */
  hostingTarget: string;
}

import { demo } from './demo';
import { goldstar } from './goldstar';

export const BRANDS: Readonly<Record<string, OperatorBrand>> = { goldstar, demo };

export const DEFAULT_OPERATOR_SLUG = 'goldstar';

/** Throws on an unknown slug so a mistyped `NEXT_PUBLIC_OPERATOR` fails the build, never ships. */
export function resolveOperatorBrand(slug: string | undefined = process.env.NEXT_PUBLIC_OPERATOR): OperatorBrand {
  const key = slug && slug.length > 0 ? slug : DEFAULT_OPERATOR_SLUG;
  const brand = BRANDS[key];
  if (!brand) {
    throw new Error(`Unknown NEXT_PUBLIC_OPERATOR "${key}" — expected one of: ${Object.keys(BRANDS).join(', ')}`);
  }
  return brand;
}

/** The brand this build was made for. Module-level so every server component shares one lookup. */
export const brand: OperatorBrand = resolveOperatorBrand();
