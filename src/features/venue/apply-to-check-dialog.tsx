'use client';
import { useMemo, useState } from 'react';
import { PlatformError, type Validation, type Venue } from '@goldstar/platform';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/buttons';
import { Input, Select } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { useSession } from '@/features/auth/use-session';
import { callable } from '@/lib/firebase/callables';
import { formatMoney } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useVenueTickets } from './use-venue-tickets';

export interface ApplyToCheckDialogProps {
  venue: Venue;
  validation: Validation;
  currency: string;
  onClose: () => void;
  onApplied: () => void;
}

interface FoundCheck {
  checkRef: string;
  table?: string;
  total: number;
  openedAt: string;
}

/**
 * Copy for a redemption that lost the race. `staffApplyValidation` (the attendant at the stand)
 * and `posApplyValidation` (this) are mutually exclusive TERMINAL states for one code — Ruling F's
 * shared guard makes the second attempt fail, and that is the guard working, not a fault. So this
 * says the code is spent rather than implying something broke.
 *
 * Both codes are handled because the handler does not exist yet and either is a defensible choice:
 * `already_exists` if the guard surfaces its `processedEvents/val_{id}` create collision,
 * `failed_precondition` if it checks `redeemedTicketId` first. Whichever the handler settles on,
 * the guest-facing sentence is the same. The generic map's "That already exists." would be both
 * vague and faintly alarming here.
 */
function redemptionRaceCopy(err: unknown): string | null {
  if (!(err instanceof PlatformError)) return null;
  if (err.code !== 'already_exists' && err.code !== 'failed_precondition') return null;
  return 'That code has already been used — the valet stand applied it first. Nothing was charged twice.';
}

/**
 * Pushes an issued validation onto an open restaurant check (Plan 7 T3's venue-side half, unblocked
 * by contracts v0.4.1).
 *
 * THE AMOUNT IS NOT SENT AND IS NOT SHOWN AS AUTHORITATIVE. v0.4.1 replaced
 * `posApplyValidation`'s `{venueId, checkRef, amount}` with `{venueId, checkRef, code, ticketId}`
 * precisely because the old shape took client-supplied money with no maximum and no issued code
 * behind it. The server resolves the validation by `(venueId, code)`, computes the amount at
 * redemption from the ticket's CURRENT base (Ruling O — an hourly rate grows between issue and
 * pickup), redeems through the shared guard, then pushes the discount. This dialog therefore
 * collects a check and a ticket and sends neither a figure nor an expectation of one: the
 * validation's stored `amount`, where it exists at all, is an issue-time figure for `partial`
 * only, and displaying it next to "Apply" would promise a number the server may not honour.
 *
 * `ticketId` is required by the contract because there is no base to price from without it, so
 * the host picks the guest's car from the venue's own live board — the same claim-scoped
 * `useVenueTickets` feed the live board renders, so no ticket outside this venue is selectable.
 */
export function ApplyToCheckDialog({ venue, validation, currency, onClose, onApplied }: ApplyToCheckDialogProps) {
  const session = useSession();
  const { tickets, loading: ticketsLoading } = useVenueTickets(session.claims?.operatorId, venue.id);

  const [table, setTable] = useState('');
  const [checks, setChecks] = useState<FoundCheck[] | null>(null);
  const [checkRef, setCheckRef] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [tableError, setTableError] = useState<string | undefined>(undefined);

  const ticketOptions = useMemo(
    () =>
      tickets.map((t) => ({
        value: t.id,
        label: [t.vehicle.color, t.vehicle.make, t.vehicle.model].filter(Boolean).join(' ') || t.vehicle.plate || t.id,
      })),
    [tickets]
  );

  const findChecks = async () => {
    if (!table.trim()) {
      setTableError('Enter the table number.');
      return;
    }
    setTableError(undefined);
    setSearching(true);
    try {
      const res = await callable('posFindCheck')({ venueId: venue.id, table: table.trim() });
      setChecks(res.checks);
      setCheckRef(res.checks.length === 1 ? (res.checks[0]?.checkRef ?? '') : '');
    } catch (e) {
      toast.error(e);
    } finally {
      setSearching(false);
    }
  };

  const apply = async () => {
    if (!checkRef || !ticketId) return;
    setApplying(true);
    try {
      await callable('posApplyValidation')({ venueId: venue.id, checkRef, code: validation.code, ticketId });
      toast.success('Validation applied to the check');
      onApplied();
    } catch (e) {
      const raced = redemptionRaceCopy(e);
      if (raced) toast.info(raced);
      else toast.error(e);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader className="pr-12">
          <DialogTitle>Apply to check</DialogTitle>
          <DialogDescription>
            Find the guest&apos;s open check and their car, then apply validation{' '}
            <span className="font-mono tracking-wider">{validation.code}</span>. The valet stand
            calculates the discount when it&apos;s applied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-2">
            <Input
              label="Table"
              value={table}
              onChange={(e) => {
                setTable(e.target.value);
                setTableError(undefined);
              }}
              error={tableError}
              fullWidth
            />
            <Button variant="secondary" onClick={() => void findChecks()} loading={searching} disabled={searching}>
              Find check
            </Button>
          </div>

          {checks !== null && checks.length === 0 ? (
            <Text size="sm" color="secondary">
              No open check found at that table. Check the number, or the check may already be closed.
            </Text>
          ) : null}

          {checks !== null && checks.length > 0 ? (
            <Select
              label="Check"
              options={checks.map((c) => ({
                value: c.checkRef,
                // The check TOTAL is the restaurant's own figure, not the validation's value —
                // labelled so it can't be misread as the discount about to be applied.
                label: `${c.table ? `Table ${c.table} — ` : ''}check total ${formatMoney(c.total, currency)}`,
              }))}
              placeholder="Select the check…"
              value={checkRef}
              onChange={(e) => setCheckRef(e.target.value)}
              fullWidth
            />
          ) : null}

          <Select
            label="Guest's car"
            options={ticketOptions}
            placeholder={ticketsLoading ? 'Loading cars…' : 'Select the car…'}
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            helperText="Cars currently at your venue. The stand prices the validation against this ticket."
            fullWidth
          />
          {!ticketsLoading && ticketOptions.length === 0 ? (
            <Text size="sm" color="secondary">
              No cars are checked in at your venue right now, so there&apos;s nothing to price the
              validation against yet.
            </Text>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={applying}>
            Cancel
          </Button>
          <Button onClick={() => void apply()} loading={applying} disabled={applying || !checkRef || !ticketId}>
            Apply validation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
