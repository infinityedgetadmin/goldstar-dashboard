import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { VenueProvider } from '../venue-context';
import { RideRequestForm } from '../ride-request-form';

const { requestMock, toastMock } = vi.hoisted(() => ({
  requestMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
// Contract-checked: the real zod input schema parses the real payload this form builds before the
// mock sees it, so a payload that violates the installed contract fails here.
vi.mock('@/lib/firebase/callables', async () => {
  const { contractCheckedCallable } = await import('./contract-checked-callable');
  return { callable: contractCheckedCallable(requestMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

const GRILL = {
  id: 'v1',
  name: 'The Grill',
  operatorId: 'op1',
  type: 'restaurant',
  status: 'active',
  geo: { lat: 39.768, lng: -86.158 },
} as unknown as Venue;

const SUGGESTION = { id: 's1', label: '1 Monument Circle, Indianapolis', geo: { lat: 39.769, lng: -86.158 } };

function renderForm() {
  return render(
    <VenueProvider venues={[GRILL]}>
      <RideRequestForm />
    </VenueProvider>
  );
}

/** Drives the address field to a committed selection, the only way to produce a `dropoff`. */
async function pickDestination() {
  fireEvent.change(screen.getByLabelText(/Destination/), { target: { value: '1 Monument' } });
  const option = await screen.findByRole('button', { name: SUGGESTION.label });
  fireEvent.click(option);
}

beforeEach(() => {
  vi.useRealTimers();
  requestMock.mockReset().mockImplementation((input: { kind?: string }) =>
    input.kind === 'ride' ? { hostRequestId: 'hr1' } : { suggestions: [SUGGESTION] }
  );
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

describe('RideRequestForm', () => {
  it('submits kind ride with the claim-derived venue id and all three required ride fields', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Guest name/), { target: { value: 'Ana Rivera' } });
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText(/Wheelchair-accessible/));
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Back entrance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith({
        venueId: 'v1',
        kind: 'ride',
        dropoff: { address: SUGGESTION.label, geo: SUGGESTION.geo },
        passengers: 4,
        accessible: true,
        name: 'Ana Rivera',
        note: 'Back entrance',
      })
    );
  });

  it('sends accessible: false explicitly when the host leaves it unticked — never omitted', async () => {
    renderForm();
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    const payload = requestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(payload).toHaveProperty('accessible', false);
  });

  it('NO DEFAULTS: refuses to submit without a destination, and says why', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByText(/Pick the destination from the suggestions/)).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'ride' }));
  });

  it('NO DEFAULTS: refuses to submit without a passenger count rather than assuming one rider', async () => {
    renderForm();
    await pickDestination();
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByText(/How many people are riding\?/)).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'ride' }));
  });

  it('offers no blank or pre-selected passenger count — the host must choose', () => {
    renderForm();
    const select = screen.getByLabelText(/Passengers/);
    expect(select).toHaveValue('');
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Select…', '1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('invalidates a committed destination when the host edits the text away from it', async () => {
    renderForm();
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '2' } });
    // Typing over the chosen address must drop the geo, not silently keep the old one.
    fireEvent.change(screen.getByLabelText(/Destination/), { target: { value: '1 Monument Circ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    expect(await screen.findByText(/Pick the destination from the suggestions/)).toBeInTheDocument();
    expect(requestMock).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'ride' }));
  });

  it('tells the host the ride is NOT booked until the operator confirms', () => {
    renderForm();
    expect(screen.getByText(/it is not booked until they do/i)).toBeInTheDocument();
  });

  it('says the operator will confirm, rather than claiming the ride is booked, on success', async () => {
    renderForm();
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Ride requested — your valet operator will confirm it'));
  });

  it('resets every field after a successful submit', async () => {
    renderForm();
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '3' } });
    fireEvent.click(screen.getByLabelText(/Wheelchair-accessible/));
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    expect(screen.getByLabelText(/Destination/)).toHaveValue('');
    expect(screen.getByLabelText(/Passengers/)).toHaveValue('');
    expect(screen.getByLabelText(/Wheelchair-accessible/)).toHaveAttribute('data-state', 'unchecked');
  });

  it('shows a sanitized error toast when the callable fails', async () => {
    renderForm();
    await pickDestination();
    fireEvent.change(screen.getByLabelText(/Passengers/), { target: { value: '2' } });
    requestMock.mockRejectedValueOnce(new Error('boom'));
    fireEvent.click(screen.getByRole('button', { name: 'Request ride' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
