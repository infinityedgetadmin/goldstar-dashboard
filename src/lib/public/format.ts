/**
 * Formats integer cents as a localized currency string, e.g.
 * `formatMoney(321, 'USD')` -> "$3.21". Mirrors goldstar-mobile's
 * `src/lib/format.ts#formatMoney` (same signature, same behavior) so the
 * guest pay sheet renders identical amounts to the mobile app for the same
 * cents value.
 */
export function formatMoney(cents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
