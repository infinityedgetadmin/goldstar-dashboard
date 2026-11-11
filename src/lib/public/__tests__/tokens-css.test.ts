import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { border, semantic, radii } from '@goldstar/platform/tokens';
import { describe, expect, it } from 'vitest';

// Regenerates the real tokens.css via the real script (not a reimplemented
// copy of its logic) so this test can't drift from what actually ships.
// Safe to run standalone regardless of gate ordering.
const repoRoot = process.cwd();

describe('generate-tokens-css.mjs — .gs-public scoped overrides (Ruling E)', () => {
  it('emits a .gs-public block containing exactly the tokens that collide with the dashboard theme', () => {
    execFileSync('node', ['scripts/generate-tokens-css.mjs'], { cwd: repoRoot });
    const css = readFileSync(path.join(repoRoot, 'src/styles/tokens.css'), 'utf8');

    expect(css).toContain('.gs-public {');

    // Full collision: dashboard's `@theme inline` radius vars win globally.
    expect(css).toContain(`--radius-sm: ${radii.sm}px;`);
    expect(css).toContain(`--radius-md: ${radii.md}px;`);
    expect(css).toContain(`--radius-lg: ${radii.lg}px;`);
    expect(css).toContain(`--radius-xl: ${radii.xl}px;`);

    // Coincidental-value collision, included defensively.
    expect(css).toContain(`--color-border: ${border.DEFAULT};`);

    // Partial collision: only the 50/600 shades of each semantic color
    // differ from the dashboard's plain `:root` block.
    expect(css).toContain(`--color-success-50: ${semantic.success[50]};`);
    expect(css).toContain(`--color-success-600: ${semantic.success[600]};`);
    expect(css).toContain(`--color-error-50: ${semantic.error[50]};`);
    expect(css).toContain(`--color-error-600: ${semantic.error[600]};`);
    expect(css).toContain(`--color-warning-50: ${semantic.warning[50]};`);
    expect(css).toContain(`--color-warning-600: ${semantic.warning[600]};`);
    expect(css).toContain(`--color-info-50: ${semantic.info[50]};`);
    expect(css).toContain(`--color-info-600: ${semantic.info[600]};`);

    // Harmless collision (PublicLayout also overrides this locally), kept
    // for a self-sufficient .gs-public block.
    expect(css).toContain(`--font-sans: 'Inter', 'Roboto', system-ui, sans-serif;`);

    // Non-collisions must NOT appear in the override block — e.g.
    // --radius-full has no dashboard equivalent and needs no override, and
    // the 100/500/700 semantic shades don't collide either. Assert the
    // override block itself doesn't contain them by checking the block is
    // exactly the expected line count (opening brace + 14 declarations +
    // closing brace = 16).
    const blockStart = css.indexOf('.gs-public {');
    const block = css.slice(blockStart);
    const blockLines = block.trim().split('\n');
    expect(blockLines).toHaveLength(16);
    expect(block).not.toContain('--radius-full');
  });
});
