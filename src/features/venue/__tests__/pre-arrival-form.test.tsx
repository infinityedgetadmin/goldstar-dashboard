import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';
import { PreArrivalForm } from '../pre-arrival-form';

const { requestMock, toastMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', async () => {
  // MINOR-2: the mock parses the REAL payload against the REAL installed contract (input
  // and output) — see contract-checked-callable.ts.
  const { contractCheckedCallable } = await import('./contract-checked-callable');
  return { callable: contractCheckedCallable(requestMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

const GRILL = { id: 'v1', name: 'The Grill', operatorId: 'op1', type: 'restaurant', status: 'active' } as unknown as Venue;

function renderForm() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <PreArrivalForm />
    </VenueProvider>
  );
}

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue({ hostRequestId: 'hr1' });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('PreArrivalForm', () => {
  // v0.4.0: eta/partySize/vip are FIRST-CLASS contract fields now. Before 0.4.0 they were
  // stripped by zod and this form folded them into `note`; that fold-in was deleted in the
  // re-vendor commit and this test changed with it. `partySize` goes as a NUMBER — the input is
  // text, and sending the string would fail the contract's `z.number().int()`.
  it('SECURITY: submits kind pre_arrival with the claim-derived venue id and the real eta/partySize/vip fields', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana Rivera' } });
    fireEvent.change(screen.getByLabelText(/ETA/), { target: { value: '19:30' } });
    fireEvent.change(screen.getByLabelText(/Party size/), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('VIP'));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Anniversary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        venueId: 'v1',
        kind: 'pre_arrival',
        name: 'Ana Rivera',
        eta: '19:30',
        partySize: 6,
        vip: true,
        note: 'Anniversary',
      })
    );
    expect(toastMock.success).toHaveBeenCalledWith('Pre-arrival sent to the valet stand');
  });

  it('omits eta/partySize/vip when the host leaves them blank rather than sending empty values', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/ETA/), { target: { value: '19:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', kind: 'pre_arrival', name: 'Ana', eta: '19:30' })
    );
  });

  it('omits the note entirely when only a name is given', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', kind: 'pre_arrival', name: 'Ana' }));
  });

  it('does not submit without a name', () => {
    renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('resets every field (including VIP) after a successful submit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByLabelText('VIP'));
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(screen.getByLabelText(/Guest name/)).toHaveValue('');
    expect(screen.getByLabelText('VIP')).toHaveAttribute('data-state', 'unchecked');
  });

  it('shows a sanitized error toast when the callable fails', async () => {
    const failure = new Error('boom');
    requestMock.mockRejectedValueOnce(failure);
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send pre-arrival' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(failure));
  });
});
