/**
 * Versioned terms text shown before a drive-home job is confirmed
 * (`guestConfirmDriveHome({ token, termsVersion })`). Bumping the copy
 * requires minting a new version constant (e.g. `DRIVE_HOME_V2`) rather than
 * editing this string in place — the version travels with every job record
 * server-side, so silently changing the text under an existing version
 * would retroactively misdescribe what past guests agreed to.
 */
export const DRIVE_HOME_V1 = 'drive-home-v1';

// Fix round 1 (Major-4): the cancellation sentence used to read "You can
// cancel before a driver is assigned at no charge" — a promise of an
// in-page cancel affordance this task never built (no cancel button
// anywhere in DriveHomeSheet, no wired-up `guestCancel` path). Reworded to
// describe the mechanism the page actually offers: the same `tel:` link
// TicketView already renders ("Call the valet stand").
export const DRIVE_HOME_TERMS_V1 =
  'By requesting this drive-home, you authorize a Goldstar driver to drive ' +
  'your own vehicle to the destination above. Before departure, the driver ' +
  'documents any pre-existing damage to your vehicle with photos, and you ' +
  'can review that documentation on this page. Your card is authorized now ' +
  'for the quoted amount and is charged only once the trip is complete. ' +
  'You can cancel by contacting the valet stand before a driver is ' +
  'assigned, at no charge.';
