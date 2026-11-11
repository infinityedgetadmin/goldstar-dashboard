import type { GuestTicket } from '@goldstar/platform';
import { Heading, Text } from '@/components/ui/typography';

/**
 * Uses a plain `<img>` rather than `next/image` — `branding.logoUrl` is
 * operator-controlled data (any Firebase Storage URL/domain per operator),
 * and `next/image` requires each remote host to be allow-listed in
 * `next.config.ts` ahead of time. That's out of this task's scope, so a
 * plain `<img>` avoids a runtime error for domains no one has configured.
 */
export function BrandHeader({
  branding,
  venueName,
}: {
  branding: GuestTicket['branding'];
  venueName: string;
}) {
  return (
    <header className="flex flex-col items-center gap-2 pt-2 text-center">
      {branding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoUrl}
          alt={`${branding.displayName} logo`}
          width={56}
          height={56}
          loading="lazy"
          className="h-14 w-14 rounded-full object-cover"
        />
      ) : null}
      {/*
        F8 (final review): `id`/`tabIndex={-1}` make this heading a valid
        programmatic focus target — pay-sheet.tsx's close-focus fallback
        focuses it when the opener button that originally launched the sheet
        has already been unmounted by the time the sheet closes (the paid
        auto-close race: TicketView swaps "Pay & tip" for "Paid · thank you"
        before the sheet's own 1.5s timer fires onClose). A plain `<h1>` with
        no tabindex is not natively focusable — `.focus()` on it would
        silently no-op and leave focus on `<body>`, the exact bug this
        fixes.
      */}
      <Heading id="guest-page-heading" tabIndex={-1} level={1} variant="heading-md" font="display">
        {branding.displayName}
      </Heading>
      <Text size="sm" color="secondary">
        {venueName}
      </Text>
    </header>
  );
}
