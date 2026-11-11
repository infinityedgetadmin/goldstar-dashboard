import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformError } from '@goldstar/platform';

// Same subscribe-and-emit mocking shape as ticket-view.test.tsx's
// `subscribeGuestTicket` mock, applied to `subscribeVenuePublic`.
let emit: (v: unknown) => void = () => {};
let emitError: (e: Error) => void = () => {};
vi.mock('@/lib/public/firebase', () => ({
  subscribeVenuePublic: (_token: string, cb: (v: unknown) => void, onError: (e: Error) => void) => {
    emit = cb;
    emitError = onError;
    return () => {};
  },
  publicFirebase: () => ({}),
}));

const staticCheckout = vi.fn(async () => ({
  clientSecret: 'pi_1_secret_x',
  publishableKey: 'pk_test_x',
  total: 1926,
  tip: 321,
  ticketToken: 'AbCdEfGhIjKlMnOpQrStUv',
}));
vi.mock('@/lib/public/callables', () => ({ guestCall: () => staticCheckout }));

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

// Same subpath-specific mock as pay-sheet.test.tsx (see that file's own
// comment): `use-stripe-loader.ts` imports `loadStripe` from
// `@stripe/stripe-js/pure`, not the bare `@stripe/stripe-js` entry, so the
// subpath needs its own mock.
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: vi.fn(async () => ({})) }));

const confirmPaymentMock = vi.fn(async () => ({}) as { error?: { message?: string } });
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: () => <iframe data-testid="payment-element" title="Payment Element" />,
  ExpressCheckoutElement: () => <iframe title="Express Checkout" />,
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}));

import { StaticCheckoutView } from '../static-checkout-view';

// Matches the venuePublic/{venueToken} shape documented in
// goldstar-platform's firestore.rules + the task-5 brief, and the exact
// fixture the platform-side staticCheckout.test.ts seeds (same
// operatorId/branding/tipPresets, plus `rates.valet` for this page's
// client-side price preview — see static-checkout-view.tsx's own comment
// on why the preview needs it and the platform test's handler doesn't).
const venue = {
  operatorId: 'goldstar',
  venueId: 'v1',
  venueName: 'St. Elmo',
  branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' },
  rates: { valet: { model: 'flat', items: [{ id: 'std', label: 'Valet', amount: 1500 }], taxRateBps: 700, fees: [] } },
  tipPresets: [18, 20, 25],
};

afterEach(() => {
  staticCheckout.mockClear();
  replace.mockClear();
  confirmPaymentMock.mockClear();
});

describe('StaticCheckoutView', () => {
  it('shows a loading skeleton before the first venuePublic snapshot arrives', () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows an honest not-found view for an unknown venueToken (no data echoed)', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(null));
    expect(await screen.findByText(/couldn.t find that/i)).toBeInTheDocument();
    expect(screen.queryByText('St. Elmo')).toBeNull();
  });

  it('shows the same not-found view on a listener error', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emitError(new Error('boom')));
    expect(await screen.findByText(/couldn.t find that/i)).toBeInTheDocument();
  });

  // F5 (final review): venuePublic's writer is a Plan 4a carry — nothing
  // writes these docs in production yet — so a malformed or
  // partially-written doc (missing `branding` or `rates.valet`, both
  // dereferenced unguarded downstream in the `vars`/`priced` memos) must
  // degrade to the same honest "payment link isn't valid" state as a
  // genuinely missing doc, not crash into Next's error shell.
  it('degrades a malformed venuePublic doc (missing branding) to the not-found view instead of crashing', async () => {
    const malformed = { operatorId: 'goldstar', venueId: 'v1', venueName: 'St. Elmo', tipPresets: [18, 20, 25] };
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    expect(() => act(() => emit(malformed))).not.toThrow();
    expect(await screen.findByText(/couldn.t find that/i)).toBeInTheDocument();
  });

  it('degrades a malformed venuePublic doc (missing rates.valet) to the not-found view instead of crashing', async () => {
    const malformed = {
      operatorId: 'goldstar',
      venueId: 'v1',
      venueName: 'St. Elmo',
      branding: { displayName: 'Goldstar', primaryColor: '#ab6034', accentColor: '#ffc30c' },
      tipPresets: [18, 20, 25],
    };
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    expect(() => act(() => emit(malformed))).not.toThrow();
    expect(await screen.findByText(/couldn.t find that/i)).toBeInTheDocument();
  });

  it('renders branding, "Pay for valet at {venue}", and the flat-rate price preview with a default tip', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    expect(await screen.findByText('Goldstar')).toBeInTheDocument();
    expect(screen.getByText('Pay for valet at St. Elmo')).toBeInTheDocument();
    // base 1500, tax 105 → subtotal/preview total 1605 (flat model, no duration).
    expect(screen.getByText('$16.05')).toBeInTheDocument();
    // defaultTip([18,20,25]) picks tipPresets[1] = 20%: 1605 + round(1605*0.20)=321 → $19.26.
    expect(screen.getByRole('button', { name: 'Tip 20%' })).toHaveAttribute('aria-pressed', 'true');
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(totalRow).getByText('$19.26')).toBeInTheDocument();
  });

  it('updates the Total row when a different tip is chosen', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    await screen.findByText('Goldstar');
    fireEvent.click(screen.getByRole('button', { name: 'No tip' }));
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(totalRow).getByText('$16.05')).toBeInTheDocument();
  });

  it('accepts only digits in the plate field, caps at 4, and hints on a partial entry', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    const plate = await screen.findByLabelText(/plate/i);
    fireEvent.change(plate, { target: { value: 'a1b2c3d4e5' } });
    expect(plate).toHaveValue('1234');
    expect(screen.queryByText(/enter all 4 digits/i)).toBeNull();

    fireEvent.change(plate, { target: { value: '12' } });
    expect(plate).toHaveValue('12');
    expect(screen.getByText(/enter all 4 digits/i)).toBeInTheDocument();
  });

  it('submits with the chosen tip and a complete plate, mounts the Payment Element with the client secret', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    const plate = await screen.findByLabelText(/plate/i);
    fireEvent.change(plate, { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() =>
      expect(staticCheckout).toHaveBeenCalledWith({
        venueToken: 'VENUETOKEN_ABCDEFGHIJKLMN',
        plateLast4: '1234',
        tip: { kind: 'preset', percent: 20 },
      })
    );
    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(screen.getAllByText('$19.26').length).toBeGreaterThan(0);
  });

  it('omits plateLast4 entirely when the plate field is left blank', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    await screen.findByText('Goldstar');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() =>
      expect(staticCheckout).toHaveBeenCalledWith({ venueToken: 'VENUETOKEN_ABCDEFGHIJKLMN', tip: { kind: 'preset', percent: 20 } })
    );
  });

  it('shows sanitized error copy (never the raw message) when guestStaticCheckout rejects', async () => {
    staticCheckout.mockRejectedValueOnce(new PlatformError('rate_limited', 'too many requests from 1.2.3.4'));
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    await screen.findByText('Goldstar');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('too many requests from 1.2.3.4');
    expect(alert.textContent).toMatch(/\S/);
  });

  it('redirects to /t/{ticketToken} once StripeForm confirms without error (no pre-redirect projection to wait on)', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    await screen.findByText('Goldstar');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await screen.findByTestId('payment-element');

    confirmPaymentMock.mockResolvedValueOnce({});
    fireEvent.click(screen.getByRole('button', { name: /Pay \$19\.26/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/t/AbCdEfGhIjKlMnOpQrStUv'));
  });

  it('does not redirect when confirmPayment resolves with an error, and shows the error verbatim', async () => {
    render(<StaticCheckoutView venueToken="VENUETOKEN_ABCDEFGHIJKLMN" />);
    act(() => emit(venue));
    await screen.findByText('Goldstar');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await screen.findByTestId('payment-element');

    confirmPaymentMock.mockResolvedValueOnce({ error: { message: 'Your card was declined.' } });
    fireEvent.click(screen.getByRole('button', { name: /Pay \$19\.26/ }));
    expect(await screen.findByText('Your card was declined.')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
