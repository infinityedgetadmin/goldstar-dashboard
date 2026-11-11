import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';
import { HostRequestForm, normalizePhoneInput } from '../host-request-form';

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
      <HostRequestForm />
    </VenueProvider>
  );
}

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue({ hostRequestId: 'hr1', ticketId: '11111111-1111-7111-8111-111111111111' });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
});

describe('normalizePhoneInput', () => {
  it('maps 4 digits to phoneLast4', () => {
    expect(normalizePhoneInput('0142')).toEqual({ phoneLast4: '0142' });
  });
  it('maps a formatted 10-digit US number to phoneE164', () => {
    expect(normalizePhoneInput('(317) 555-0142')).toEqual({ phoneE164: '+13175550142' });
  });
  it('maps an 11-digit leading-1 number to phoneE164', () => {
    expect(normalizePhoneInput('1 317 555 0142')).toEqual({ phoneE164: '+13175550142' });
  });
  it('rejects everything else', () => {
    expect(normalizePhoneInput('12345')).toBeNull();
    expect(normalizePhoneInput('abc')).toBeNull();
    expect(normalizePhoneInput('')).toBeNull();
  });
});

describe('HostRequestForm', () => {
  it('SECURITY: submits kind car with the claim-derived venue id and the typed last-4', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '0142' } });
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Wheelchair in trunk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        venueId: 'v1',
        kind: 'car',
        phoneLast4: '0142',
        table: '12',
        name: 'Ana',
        note: 'Wheelchair in trunk',
      })
    );
    expect(toastMock.success).toHaveBeenCalledWith('Car requested');
  });

  it('sends a full phone as phoneE164 instead of phoneLast4', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '(317) 555-0142' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalledWith({ venueId: 'v1', kind: 'car', phoneE164: '+13175550142' }));
  });

  it("shows the brief's unmatched copy when no ticket matched", async () => {
    requestMock.mockResolvedValueOnce({ hostRequestId: 'hr1' });
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '0142' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalledWith('No ticket found — the valet stand has been notified'));
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('rejects an invalid phone with inline copy and never calls the callable', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    expect(await screen.findByText('Enter the last 4 digits, or a full US phone number.')).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('shows a sanitized error toast when the callable fails, and keeps the typed values', async () => {
    const failure = new Error('boom');
    requestMock.mockRejectedValueOnce(failure);
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '0142' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(failure));
    expect(screen.getByLabelText(/Guest phone/)).toHaveValue('0142');
  });

  it('clears the form after a successful submit', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Table/), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText(/Guest phone/), { target: { value: '0142' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request car' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(screen.getByLabelText(/Guest phone/)).toHaveValue('');
    expect(screen.getByLabelText(/Table/)).toHaveValue('');
  });
});
