import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Ticket } from '@goldstar/platform';

// M6a/b (final review): CancelTicketDialog (modified this branch — the voidsAuthorization copy
// branch, and reuse by the dispatch board for job tickets) had ZERO test coverage anywhere in
// this repo. Mirrors the mocking convention `secrets-card.test.tsx` already establishes for a
// dialog that calls a callable + toast on submit.
const { cancelMock, toastMock } = vi.hoisted(() => ({
  cancelMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', () => ({ callable: () => cancelMock }));
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

import { CancelTicketDialog } from '../cancel-ticket-dialog';

function ticket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 't1',
    operatorId: 'goldstar',
    venueId: 'v1',
    jobType: 'valet',
    status: 'delivered',
    source: 'staff',
    guest: { phoneLast4: '1234', consentSms: true },
    vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
    flags: { assistance: false, accessibleVehicle: false, photosSkipped: false, vip: false },
    attendants: { claimedBy: 'att1' },
    times: { checkedInAt: '2026-08-23T19:00:00.000Z' },
    damageReportIds: [],
    incidentIds: [],
    guestToken: 'x'.repeat(22),
    ...over,
  } as unknown as Ticket;
}

const onClose = vi.fn();

beforeEach(() => {
  cancelMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  onClose.mockReset();
});

describe('CancelTicketDialog', () => {
  it('shows the ticket summary in the title and the default (non-voiding) description for a valet ticket with no payment yet', () => {
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Cancel Blue Honda Civic' })).toBeInTheDocument();
    expect(screen.getByText("The guest and any assigned driver are notified. This can't be undone.")).toBeInTheDocument();
    expect(screen.queryByText(/authorization is voided/)).toBeNull();
  });

  // The voidsAuthorization copy branch: jobType !== 'valet' AND payment.status === 'authorized'.
  it('shows the voidsAuthorization copy for a non-valet job with an authorized (uncaptured) payment', () => {
    render(
      <CancelTicketDialog
        ticket={ticket({ jobType: 'drive_home', payment: { status: 'authorized', base: 2500, tip: 0, tax: 0, fees: 0, total: 2500, currency: 'USD', billTo: 'guest' } })}
        onClose={onClose}
      />
    );
    expect(screen.getByText("The guest and any assigned driver are notified. Their card's authorization is voided — they are not charged. This can't be undone.")).toBeInTheDocument();
    expect(screen.queryByText("The guest and any assigned driver are notified. This can't be undone.")).toBeNull();
  });

  it('does NOT show the voidsAuthorization copy for a non-valet job whose payment is already paid (nothing to void)', () => {
    render(
      <CancelTicketDialog
        ticket={ticket({ jobType: 'drive_home', payment: { status: 'paid', base: 2500, tip: 0, tax: 0, fees: 0, total: 2500, currency: 'USD', billTo: 'guest' } })}
        onClose={onClose}
      />
    );
    expect(screen.queryByText(/authorization is voided/)).toBeNull();
    expect(screen.getByText("The guest and any assigned driver are notified. This can't be undone.")).toBeInTheDocument();
  });

  it('does NOT show the voidsAuthorization copy for a valet ticket even if its payment status were somehow "authorized" (jobType-gated, not just payment-status-gated)', () => {
    render(
      <CancelTicketDialog
        ticket={ticket({ jobType: 'valet', payment: { status: 'authorized', base: 1500, tip: 0, tax: 0, fees: 0, total: 1500, currency: 'USD', billTo: 'guest' } })}
        onClose={onClose}
      />
    );
    expect(screen.queryByText(/authorization is voided/)).toBeNull();
  });

  it('the Cancel ticket button is disabled until a non-blank reason is entered', () => {
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);
    const cancelButton = screen.getByRole('button', { name: 'Cancel ticket' });
    expect(cancelButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: '   ' } });
    expect(cancelButton).toBeDisabled(); // whitespace-only reason stays invalid (trimmed check)

    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'Guest cancelled by phone' } });
    expect(cancelButton).toBeEnabled();
  });

  it('shows a live character count as the reason is typed', () => {
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);
    expect(screen.getByText('0/200')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'No longer needed' } });
    expect(screen.getByText('16/200')).toBeInTheDocument();
  });

  it('submits the trimmed reason and ticket id to staffCancelTicket, shows a success toast, and closes', async () => {
    cancelMock.mockResolvedValue({ ok: true });
    render(<CancelTicketDialog ticket={ticket({ id: 'ticket-99' })} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: '  Guest no-showed  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ticket' }));

    await waitFor(() => expect(cancelMock).toHaveBeenCalledTimes(1));
    expect(cancelMock).toHaveBeenCalledWith({ ticketId: 'ticket-99', reason: 'Guest no-showed' });
    expect(toastMock.success).toHaveBeenCalledWith('Ticket cancelled');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('shows the loading state on the Cancel ticket button while the callable is in flight', async () => {
    let resolveCall: (v: unknown) => void = () => {};
    cancelMock.mockReturnValue(new Promise((resolve) => (resolveCall = resolve)));
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'Duplicate ticket' } });
    const cancelButton = screen.getByRole('button', { name: 'Cancel ticket' });
    fireEvent.click(cancelButton);

    await waitFor(() => expect(cancelButton).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Keep ticket' })).toBeDisabled();

    resolveCall({ ok: true });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('on a rejected callable, shows a sanitized error toast, does NOT close, and re-enables the buttons', async () => {
    cancelMock.mockRejectedValue(new Error('permission-denied: staff role required'));
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Cancellation reason'), { target: { value: 'Wrong ticket' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel ticket' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
    expect(toastMock.error).toHaveBeenCalledWith(expect.any(Error));
    expect(onClose).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();

    const cancelButton = screen.getByRole('button', { name: 'Cancel ticket' });
    expect(cancelButton).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Keep ticket' })).toBeEnabled();
  });

  it('Keep ticket closes the dialog without calling the callable', () => {
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep ticket' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('closing via the dialog\'s own close control calls onClose without calling the callable', () => {
    render(<CancelTicketDialog ticket={ticket()} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(cancelMock).not.toHaveBeenCalled();
  });
});
