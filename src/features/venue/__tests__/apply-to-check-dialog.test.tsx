import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlatformError, type Ticket, type Validation, type Venue } from '@goldstar/platform';
import type { Session } from '@/features/auth/session-provider';
import { ApplyToCheckDialog } from '../apply-to-check-dialog';

const { requestMock, toastMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// Contract-checked: the REAL v0.4.1 input schema parses what this dialog builds before the mock
// sees it, so a payload carrying the removed `amount` — or missing the new `code`/`ticketId` —
// fails here rather than in production.
vi.mock('@/lib/firebase/callables', async () => {
  const { contractCheckedCallable } = await import('./contract-checked-callable');
  return { callable: contractCheckedCallable(requestMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

let mockTickets: Ticket[] = [];
vi.mock('../use-venue-tickets', () => ({
  useVenueTickets: () => ({ tickets: mockTickets, loading: false, error: false, retry: vi.fn() }),
}));

const mockSession: Partial<Session> = { claims: { operatorId: 'op1', roles: ['venue_user'], venueIds: ['v1'], claimsVersion: 1 } };
vi.mock('@/features/auth/use-session', () => ({ useSession: () => mockSession }));

const VENUE = { id: 'v1', name: 'The Grill', operatorId: 'op1', pos: { provider: 'toast', restaurantGuid: 'rg1' } } as unknown as Venue;
const VALIDATION = {
  id: 'val1',
  operatorId: 'op1',
  venueId: 'v1',
  code: 'AB12CD',
  type: 'full',
  issuedBy: 'host1',
  issuedAt: '2026-08-30T18:00:00.000Z',
} as unknown as Validation;

const TICKET_ID = '01912345-7abc-7def-8123-456789abcdef';
function ticket(id: string, over: Partial<Ticket> = {}): Ticket {
  return {
    id,
    operatorId: 'op1',
    venueId: 'v1',
    jobType: 'valet',
    status: 'checked_in',
    vehicle: { color: 'Blue', make: 'Honda', model: 'Civic', plate: 'ABC123' },
    ...over,
  } as unknown as Ticket;
}

const CHECK = { checkRef: 'order-1:check-1', table: '12', total: 8450, openedAt: '2026-08-30T18:30:00.000Z' };

function renderDialog(onApplied = vi.fn()) {
  return render(
    <ApplyToCheckDialog venue={VENUE} validation={VALIDATION} currency="USD" onClose={vi.fn()} onApplied={onApplied} />
  );
}

/** Drives the two-step flow: find the check, then pick the car. */
async function selectCheckAndCar() {
  fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '12' } });
  fireEvent.click(screen.getByRole('button', { name: 'Find check' }));
  await screen.findByLabelText(/^Check/);
  fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
}

beforeEach(() => {
  mockTickets = [ticket(TICKET_ID)];
  requestMock.mockReset().mockImplementation((input: { code?: string }) =>
    input.code === undefined ? { checks: [CHECK] } : { ok: true as const }
  );
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
});

describe('ApplyToCheckDialog', () => {
  it('finds an open check by table and applies the validation with the v0.4.1 payload', async () => {
    const onApplied = vi.fn();
    renderDialog(onApplied);
    await selectCheckAndCar();
    fireEvent.click(screen.getByRole('button', { name: 'Apply validation' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenLastCalledWith({
        venueId: 'v1',
        checkRef: CHECK.checkRef,
        code: 'AB12CD',
        ticketId: TICKET_ID,
      })
    );
    expect(onApplied).toHaveBeenCalled();
  });

  it('MONEY: never sends an amount — the server prices the redemption', async () => {
    renderDialog();
    await selectCheckAndCar();
    fireEvent.click(screen.getByRole('button', { name: 'Apply validation' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledTimes(2));
    const payload = requestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    // v0.4.1 removed `amount` precisely because the old shape took client-supplied money with no
    // bound and no issued code behind it. The contract-checked mock strips unknown keys, so this
    // asserts intent as well as shape.
    expect(payload).not.toHaveProperty('amount');
    expect(Object.keys(payload).sort()).toEqual(['checkRef', 'code', 'ticketId', 'venueId']);
  });

  it('MONEY: shows no discount figure — the only amount on screen is labelled as the check total', async () => {
    renderDialog();
    await selectCheckAndCar();
    // $84.50 is the restaurant's check total, and it says so. A validation value shown here would
    // promise a number the server computes later from the ticket's CURRENT base (Ruling O).
    expect(screen.getByText(/check total \$84\.50/)).toBeInTheDocument();
    expect(screen.getByText(/calculates the discount when it's applied/i)).toBeInTheDocument();
  });

  it('searches by table via posFindCheck, scoped to the claim-derived venue', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find check' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', table: '12' }));
  });

  it('will not search without a table number, and says why', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Find check' }));
    expect(screen.getByText('Enter the table number.')).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('reports an empty result as "no open check" rather than an error', async () => {
    requestMock.mockImplementationOnce(() => ({ checks: [] }));
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find check' }));

    expect(await screen.findByText(/No open check found at that table/)).toBeInTheDocument();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('Apply stays disabled until BOTH a check and a car are chosen', async () => {
    renderDialog();
    const apply = () => screen.getByRole('button', { name: 'Apply validation' });
    expect(apply()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Find check' }));
    await screen.findByLabelText(/^Check/);
    // A single result auto-selects, but the car has not been picked yet.
    expect(apply()).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Guest's car/), { target: { value: TICKET_ID } });
    expect(apply()).toBeEnabled();
  });

  it('SECURITY: the car list comes from the venue-scoped live feed, so no other venue\'s ticket is selectable', async () => {
    mockTickets = [ticket(TICKET_ID)];
    renderDialog();
    const options = screen.getAllByRole('option').map((o) => o.getAttribute('value')).filter(Boolean);
    expect(options).toEqual([TICKET_ID]);
  });

  it('RACE: a code the stand already redeemed reads as spent, not as a failure', async () => {
    renderDialog();
    await selectCheckAndCar();
    requestMock.mockRejectedValueOnce(new PlatformError('already_exists', 'validation already redeemed'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply validation' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('already been used')));
    // Ruling F makes the second attempt fail BY DESIGN — surfacing it as an error would tell the
    // host something broke when the guard did its job.
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('RACE: handled under failed_precondition too, since the handler has not settled on a code', async () => {
    renderDialog();
    await selectCheckAndCar();
    requestMock.mockRejectedValueOnce(new PlatformError('failed_precondition', 'already redeemed'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply validation' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith(expect.stringContaining('already been used')));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('a genuine failure still sanitizes through toast.error rather than the race copy', async () => {
    renderDialog();
    await selectCheckAndCar();
    requestMock.mockRejectedValueOnce(new PlatformError('provider_unavailable', 'toast is down'));
    fireEvent.click(screen.getByRole('button', { name: 'Apply validation' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.info).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('explains an empty car list instead of leaving an unusable picker', () => {
    mockTickets = [];
    renderDialog();
    expect(screen.getByText(/No cars are checked in at your venue right now/)).toBeInTheDocument();
  });
});
