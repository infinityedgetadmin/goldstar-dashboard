import { writeFileSync } from 'node:fs';
import { brand, accent, text, surface, border, semantic, typeScale, radii, spacing } from '@goldstar/platform/tokens';
const lines = ['@theme {'];
for (const [k, v] of Object.entries(brand)) if (k !== 'DEFAULT') lines.push(`  --color-primary-${k}: ${v};`);
for (const [k, v] of Object.entries(accent)) if (k !== 'DEFAULT') lines.push(`  --color-accent-${k}: ${v};`);
for (const [k, v] of Object.entries(text)) lines.push(`  --color-text-${k}: ${v};`);
for (const [k, v] of Object.entries(surface)) lines.push(`  --color-bg-${k}: ${v};`);
lines.push(`  --color-border: ${border.DEFAULT}; --color-border-light: ${border.light}; --color-border-dark: ${border.dark};`);
for (const [n, fam] of Object.entries(semantic)) for (const [k, v] of Object.entries(fam)) lines.push(`  --color-${n}-${k}: ${v};`);
lines.push(`  --font-display: 'Cormorant Garamond', Georgia, serif; --font-sans: 'Inter', 'Roboto', system-ui, sans-serif;`);
for (const [k, v] of Object.entries(typeScale)) lines.push(`  --text-${k}: ${v.fontSize}px; --text-${k}--line-height: ${v.lineHeight}; --text-${k}--font-weight: ${v.fontWeight};${v.letterSpacing ? ` --text-${k}--letter-spacing: ${v.letterSpacing}em;` : ''}`);
for (const [k, v] of Object.entries(radii)) lines.push(`  --radius-${k}: ${v}px;`);
for (const [k, v] of Object.entries(spacing)) lines.push(`  --spacing-${k}: ${v}px;`);
lines.push('}');

// ---------------------------------------------------------------------------
// .gs-public scoped override block (Ruling E, task-1-report.md)
//
// goldstar-transportation's pre-existing dashboard theme (src/app/globals.css)
// independently declares several of the same CSS custom property names as
// the platform tokens above. Because `@import` rules must appear before all
// other rules, this file's `@theme` block is necessarily earlier in
// globals.css's source order than the dashboard's own `@theme inline { }`
// block and plain `:root { }` block further down that file. Tailwind v4
// merges same-key declarations across `@theme`-family blocks and keeps
// whichever appears LAST in source order, and a later plain `:root` rule
// wins over an earlier one the normal CSS way — so for every name below,
// the dashboard's value currently wins globally, and the platform token is
// silently shadowed everywhere, including inside `(public)`. Verified
// empirically with a live `postcss` + `@tailwindcss/postcss` compile, then
// with real computed-style checks in Chromium via Playwright (see
// task-1-report.md, "Ruling E fix").
//
// The fix: re-declare exactly these colliding names, scoped to `.gs-public`
// (the class PublicLayout puts on its root element). CSS custom properties
// resolve by DOM proximity, not by a `:root`-vs-`.gs-public` specificity
// fight — an element with its own explicit declaration for a custom
// property always uses that value instead of inheriting from an ancestor,
// regardless of where either rule sits in the stylesheet. So within the
// `(public)` route subtree these values win deterministically, without
// touching a single line of the dashboard's own theme.
//
// This list is a manually-verified snapshot, not an automatic diff against
// globals.css. If a future @goldstar/platform tokens release adds a name
// that collides with something in goldstar-transportation's own
// src/app/globals.css, add it here too — regenerating this file will not
// detect a new collision on its own.
const SCOPE_OVERRIDES = [
  // --radius-{sm,md,lg,xl}: full collision. The dashboard's `@theme inline`
  // sets these to `calc(var(--radius) ± Npx)`; the platform's fixed px
  // values are completely shadowed by that global cascade. (--radius-full
  // has no dashboard equivalent, so it needs no override.)
  ['--radius-sm', `${radii.sm}px`],
  ['--radius-md', `${radii.md}px`],
  ['--radius-lg', `${radii.lg}px`],
  ['--radius-xl', `${radii.xl}px`],
  // --color-border: the dashboard's `:root` and `@theme inline` values both
  // already happen to equal this hex (#d9dfe7, expressed two different
  // ways) — harmless today, but included so a future edit to either side
  // can't silently introduce drift without this override catching it.
  ['--color-border', border.DEFAULT],
  // --color-{success,error,warning,info}-{50,600}: the dashboard's plain
  // `:root` block (not `@theme`) redeclares these two shades of each
  // semantic color, but deferred item (a) (final review) corrects this
  // comment's prior claim that all four families genuinely differ — only
  // `--color-success-50`/`--color-success-600` actually have different hex
  // values than the platform tokens; error/warning/info 50/600 happen to
  // already coincide with the dashboard's values. All eight stay overridden
  // here regardless (not just the two that currently differ), same
  // reasoning as `--color-border` above: a future edit to either side's
  // value can't silently reintroduce drift without this override catching
  // it. The 100/500/700 shades don't collide at all and need no override.
  ['--color-success-50', semantic.success[50]],
  ['--color-success-600', semantic.success[600]],
  ['--color-error-50', semantic.error[50]],
  ['--color-error-600', semantic.error[600]],
  ['--color-warning-50', semantic.warning[50]],
  ['--color-warning-600', semantic.warning[600]],
  ['--color-info-50', semantic.info[50]],
  ['--color-info-600', semantic.info[600]],
  // --font-sans: shadowed globally by the dashboard's `:root` value, but
  // PublicLayout's own div already locally overrides it via next/font's
  // Inter `variable` class (an element-scoped override that beats `:root`
  // on its own). Included here too so `.gs-public` is a complete,
  // self-sufficient statement of the platform token set, independent of
  // what any one component happens to also do.
  ['--font-sans', "'Inter', 'Roboto', system-ui, sans-serif"],
];

lines.push('');
lines.push('.gs-public {');
for (const [name, value] of SCOPE_OVERRIDES) lines.push(`  ${name}: ${value};`);
lines.push('}');

writeFileSync('src/styles/tokens.css', lines.join('\n') + '\n');
console.log('tokens.css written');
