import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { IssueValidationDialog, parseDollarsToCents } from '../issue-validation-dialog';

const { issueMock, toastMock } = vi.hoisted(() => ({
  issueMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/firebase/callables', async () => {
  // MINOR-2: the mock parses the REAL payload against the REAL installed contract (input
  // and output) — see contract-checked-callable.ts.
  const { contractCheckedCallable } = await import('./contract-checked-callable');
  return { callable: contractCheckedCallable(issueMock) };
});
vi.mock('@/lib/toast', () => ({ toast: toastMock }));

function venue(over: Record<string, unknown> = {}): Venue {
  return {
    id: 'v1',
    name: 'The Grill',
    operatorId: 'op1',
    rates: {
      valet: { model: 'flat', items: [{ id: 'r1', label: 'Event rate', amount: 1000 }], taxRateBps: 0, fees: [] },
      validations: { allowPartial: true, maxAmount: 1500 },
    },
    ...over,
  } as unknown as Venue;
}

const onClose = vi.fn();

function renderDialog(v: Venue = venue()) {
  return render(<IssueValidationDialog venue={v} currency="USD" onClose={onClose} />);
}

beforeEach(() => {
  issueMock.mockReset().mockResolvedValue({ code: 'AB12CD' });
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  onClose.mockReset();
});

describe('parseDollarsToCents', () => {
  it('parses whole and fractional dollars to integer cents', () => {
    expect(parseDollarsToCents('12')).toBe(1200);
    expect(parseDollarsToCents('12.5')).toBe(1250);
    expect(parseDollarsToCents('$12.34')).toBe(1234);
  });
  it('rejects non-amounts, negatives, zero, and >2 decimals', () => {
    expect(parseDollarsToCents('')).toBeNull();
    expect(parseDollarsToCents('-5')).toBeNull();
    expect(parseDollarsToCents('0')).toBeNull();
    expect(parseDollarsToCents('1.234')).toBeNull();
    expect(parseDollarsToCents('abc')).toBeNull();
  });
});

describe('IssueValidationDialog', () => {
  it('issues a full validation with only the claim-derived venue id and type', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledWith({ venueId: 'v1', type: 'full' }));
  });

  it('shows the returned code in a success state instead of closing', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    expect(await screen.findByTestId('issued-code')).toHaveTextContent('AB12CD');
    expect(onClose).not.toHaveBeenCalled();
    expect(toastMock.success).toHaveBeenCalledWith('Validation issued');

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('issues a partial with the typed amount in integer cents', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'partial' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '12.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledWith({ venueId: 'v1', type: 'partial', amount: 1250 }));
  });

  it('MONEY: blocks a partial above rates.validations.maxAmount client-side (server still owns the rule)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'partial' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '15.01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    expect(await screen.findByText('The most you can validate is $15.00.')).toBeInTheDocument();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('blocks a malformed partial amount with inline copy', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'partial' } });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: 'twelve' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    expect(await screen.findByText('Enter an amount, e.g. 12.50')).toBeInTheDocument();
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('issues a comp validation with only the venue id and type (N2: the one shape no other component test sent)', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'comp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledWith({ venueId: 'v1', type: 'comp' }));
  });

  it('issues an alternate-rate validation with the selected rateId', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/Type/), { target: { value: 'rate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    await waitFor(() => expect(issueMock).toHaveBeenCalledWith({ venueId: 'v1', type: 'rate', rateId: 'r1' }));
  });

  it('does not offer partial when the venue disallows it', () => {
    renderDialog(venue({ rates: { valet: { model: 'flat', items: [], taxRateBps: 0, fees: [] }, validations: { allowPartial: false, maxAmount: 1500 } } }));
    expect(screen.queryByRole('option', { name: /Partial/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Alternate rate' })).not.toBeInTheDocument();
  });

  it('shows a sanitized error toast when the callable fails and stays open for a retry', async () => {
    const failure = new Error('boom');
    issueMock.mockRejectedValueOnce(failure);
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Issue validation' }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith(failure));
    expect(screen.getByRole('button', { name: 'Issue validation' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Cancel closes without issuing', () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(issueMock).not.toHaveBeenCalled();
  });
});
