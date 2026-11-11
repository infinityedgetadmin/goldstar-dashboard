import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge`'s default config has no knowledge of the custom
 * `--text-*` font-size scale this repo's `src/styles/tokens.css` (via
 * `@goldstar/platform/tokens`) generates — `display-2xl`, `heading-lg`,
 * `body-sm`, `ui-md`, etc. Without registering them, `twMerge` falls back
 * to its default heuristic for any unrecognized `text-*` class and treats
 * it as a *text-color* utility. That puts `text-heading-sm` (font-size)
 * and `text-text-primary` (color) in the same conflict group, and
 * `twMerge` silently drops whichever comes first — verified empirically:
 * `twMerge('text-heading-sm text-text-primary')` -> `'text-text-primary'`,
 * the font-size class vanishes. This is a real, previously-undetected bug:
 * every component that does `cn(sizeClass, colorClass)` — `Heading`,
 * `Text`, `Label` (P3/P1) and this task's `Card`/`Badge`/`StatTile`/etc —
 * loses its font-size class whenever a color class is also present.
 * `card.test.tsx`'s class assertions caught it (task-1-report.md); it was
 * unnoticed until then because no prior test asserted on the exact
 * className string for a sized + colored element.
 *
 * Fixed at the root, here, rather than reordering classes at every call
 * site: registering the scale's names under Tailwind's `text` theme
 * namespace (per tailwind-merge's own "Adding custom font sizes" docs)
 * makes `twMerge` recognize them as font-size, not color — so they no
 * longer collide with `text-text-*`/`text-primary-*`/etc. This changes no
 * className call sites (including the protected `Heading`/`Text`/`Label`
 * components) — it only fixes how the shared `cn()` merges classes that
 * were already being passed to it.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display-2xl',
        'display-xl',
        'display-lg',
        'display-md',
        'display-sm',
        'display-xs',
        'heading-xl',
        'heading-lg',
        'heading-md',
        'heading-sm',
        'heading-xs',
        'body-xl',
        'body-lg',
        'body-md',
        'body-sm',
        'body-xs',
        'ui-xl',
        'ui-lg',
        'ui-md',
        'ui-sm',
        'ui-xs',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Recursively removes own keys whose value is `undefined`, at every nesting level (plain objects
 * and arrays of objects) — WITHOUT enabling Firestore's `ignoreUndefinedProperties` globally.
 *
 * Why this exists (task-5-review.md Critical #1): a zod-parsed object CAN have an own key set to
 * `undefined` — not merely "absent" — whenever the corresponding INPUT key was present-but-undefined
 * (verified directly against the installed zod: `z.object({x: z.string().optional()}).parse({x:
 * undefined})` -> `{x: undefined}`, `'x' in result === true`; this is true for a plain `.optional()`
 * field, not only a `z.preprocess`-wrapped one). React Hook Form's internal state always keeps every
 * `defaultValues` key present, so any RHF-driven form field a `Controller`/`onChange` later sets back
 * to `undefined` (a cleared optional number input, a disabled optional sub-object) reproduces this
 * exact shape. `firebase/firestore`'s `setDoc`/`updateDoc` reject an own key whose value is literally
 * `undefined` with `FirebaseError: ... Unsupported field value: undefined` — a real, both-mocked-SDK-
 * invisible crash the review reproduced against the real SDK (`goldstar-transportation`'s own
 * `venue-form.tsx`, before this fix).
 *
 * `ignoreUndefinedProperties: true` on the Firestore client was considered and rejected (same
 * reasoning as the review's own fix-shape note): it's a single, blast-radius-wide client setting
 * that would silently mask this same bug class for every other write site in the app forever,
 * instead of forcing each one to be deliberate about what "cleared" means for its own payload. This
 * is the narrow, call-site-local alternative — strip right before the write, nowhere else.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[key] = stripUndefinedDeep(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Order-independent array equality, by content. Used (fix round 1, task-6-review.md Major 2/Major 3)
 * to decide whether a checkbox-driven array field (roles, venues, endorsements) genuinely CHANGED
 * from its as-loaded value before including it in an `updateDoc` payload — a naive `JSON.stringify`
 * comparison against the stored array would false-positive "changed" whenever a toggle helper
 * re-sorts into a canonical order that differs from how the array happened to be stored.
 */
export function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((x) => bSet.has(x));
}

/** Same idea as {@link sameSet}, for a flat string-to-string map (e.g. `externalIds`). */
export function sameRecord(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  return aKeys.length === bKeys.length && aKeys.every((k) => a[k] === b[k]);
}
