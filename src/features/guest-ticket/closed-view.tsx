import type { GuestTicket } from '@goldstar/platform';
import { PAID_STATUSES } from '@/lib/public/payment-status';
import { Heading, Text } from '@/components/ui/typography';

type ClosedKind = 'expired' | 'closed' | 'cancelled';

/**
 * The guest projection (`GuestTicket`) carries no receipt URL — there's no
 * such field on the schema, and building a real receipts endpoint is out of
 * this task's scope. Rather than link somewhere fake, this renders the
 * actual payment breakdown already present on the ticket as an honest
 * inline "receipt". Shared by ClosedView (status `closed`) and TicketView
 * (status `delivered`, which the brief's interface note calls out as also
 * needing a receipt but the given `ticket-view.tsx` example didn't render
 * one for — see task-2-report.md).
 */
export function ReceiptSummary({ payment }: { payment: GuestTicket['payment'] }) {
  const format = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency }).format(cents / 100);
  const rows: Array<[string, number]> = [
    ['Base', payment.base],
    ['Tip', payment.tip],
    ['Tax', payment.tax],
    ['Fees', payment.fees],
  ];
  return (
    <section aria-label="Receipt" className="rounded-2xl border border-border bg-bg-primary p-4">
      <Text size="xs" color="tertiary" className="uppercase tracking-wide">
        Receipt
      </Text>
      <dl className="mt-2 space-y-1">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex items-center justify-between">
            <dt>
              <Text size="sm" color="secondary" as="span">
                {label}
              </Text>
            </dt>
            <dd>
              <Text size="sm" color="secondary" as="span">
                {format(amount)}
              </Text>
            </dd>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border pt-1">
          <dt>
            <Text weight="semibold" as="span">
              Total
            </Text>
          </dt>
          <dd>
            <Text weight="semibold" as="span">
              {format(payment.total)}
            </Text>
          </dd>
        </div>
      </dl>
    </section>
  );
}

const COPY: Record<ClosedKind, { heading: string; body: (ticket?: GuestTicket) => string }> = {
  expired: {
    heading: 'Link expired',
    body: () => 'This link has expired. Ask the valet stand for a new one.',
  },
  closed: {
    heading: 'All set',
    body: (ticket) => `Thanks for visiting ${ticket?.venueName ?? 'us'}.`,
  },
  cancelled: {
    heading: 'Ticket cancelled',
    body: () => 'This ticket was cancelled.',
  },
};

export function ClosedView({ kind, ticket }: { kind: ClosedKind; ticket?: GuestTicket }) {
  const copy = COPY[kind];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Heading level={1} variant="heading-md">
        {copy.heading}
      </Heading>
      <Text color="secondary">{copy.body(ticket)}</Text>
      {/* Deferred item (b), final review: was a third byte-for-byte copy of this
          set (ticket-view.tsx/pay-sheet.tsx already shared one via
          `@/lib/public/payment-status` — see that file's own JSDoc) — now
          imports the same Set instead of drifting again. */}
      {kind === 'closed' && ticket && PAID_STATUSES.has(ticket.payment.status) ? (
        <div className="w-full text-left">
          <ReceiptSummary payment={ticket.payment} />
        </div>
      ) : null}
    </main>
  );
}
