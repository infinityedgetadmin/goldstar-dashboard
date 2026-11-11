/**
 * Dashboard formatting utilities.
 *
 * DRY: `formatMoney` is re-exported as-is from the guest surface's
 * `src/lib/public/format.ts` rather than duplicated — same cents-based
 * signature, same behavior, so a dollar amount renders identically on the
 * guest ticket/pay pages and in the dashboard. Everything below it is
 * dashboard-only (dates, phone numbers) — the guest surface has no need
 * for either today.
 */
export { formatMoney } from './public/format';

/**
 * Formats a date as a short, locale-aware string, e.g. `Aug 23, 2026`.
 * Accepts anything `Date` accepts (ISO string, epoch ms, `Date`).
 */
export function formatDate(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

/**
 * Formats a date + time as a locale-aware string, e.g. `Aug 23, 2026, 3:45 PM`.
 */
export function formatDateTime(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * Formats a US phone number as `(317) 555-0142`. Falls back to the raw
 * input, trimmed, if it isn't a 10 or 11-digit US number (e.g. already
 * formatted, or an international number) — this dashboard has no need to
 * validate phone numbers here, only to display the common case cleanly.
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const tenDigit = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (tenDigit.length !== 10) return raw.trim();
  return `(${tenDigit.slice(0, 3)}) ${tenDigit.slice(3, 6)}-${tenDigit.slice(6)}`;
}
