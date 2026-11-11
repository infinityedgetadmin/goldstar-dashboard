/**
 * WCAG contrast utilities (WCAG 2.1 §1.4.3 relative luminance / contrast
 * ratio formulas: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 * Used by the branding editor to warn when an operator's chosen primary
 * color would fail accessible contrast against white button/nav text.
 */

/** Parses a `#rgb` or `#rrggbb` hex color into [r, g, b] channels in [0, 255]. Invalid input returns black. */
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, '');
  const full = normalized.length === 3 ? normalized.replaceAll(/(.)/g, '$1$1') : normalized;
  const match = /^([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(full);
  if (!match) return [0, 0, 0];
  const [, r, g, b] = match;
  return [parseInt(r ?? '00', 16), parseInt(g ?? '00', 16), parseInt(b ?? '00', 16)];
}

/** One channel's contribution to relative luminance (WCAG 2.1 formula). */
function linearizeChannel(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a hex color, from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/**
 * WCAG contrast ratio between two hex colors, from 1 (identical / no
 * contrast) to 21 (black vs. white, maximum contrast). WCAG AA for normal
 * text requires >= 4.5:1.
 */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}
