import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlatformError, type GuestTicket } from '@goldstar/platform';

const create = vi.fn(async () => ({ clientSecret: 'pi_1_secret_x', publishableKey: 'pk_test_x', total: 1926, tip: 321 }));
vi.mock('@/lib/public/callables', () => ({ guestCall: () => create }));

// Fix round 1 (Major-1): `use-stripe-loader.ts` now imports `loadStripe`
// from the `@stripe/stripe-js/pure` subpath (see that file's own JSDoc for
// why) rather than the bare `'@stripe/stripe-js'` entry. `vi.mock`
// matches by exact module specifier, so the subpath needs its own mock —
// without this, the test would resolve the REAL `@stripe/stripe-js/pure`
// package.
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe: vi.fn(async () => ({})) }));

// `confirmPaymentMock` is hoisted to module scope (rather than the given
// spec's inline `vi.fn(async () => ({}))` created fresh inside the mock
// factory) so the "confirmPayment error" test below can reconfigure its
// resolved value per test via `mockResolvedValueOnce`. Disclosed mock-
// plumbing adaptation only — the given test's assertions are unchanged.
const confirmPaymentMock = vi.fn(async () => ({}) as { error?: { message?: string } });
// Fix round 1 (Ruling F): `PaymentElement`/`ExpressCheckoutElement` render
// as `<iframe>` here (not `<div>`), matching what Stripe actually renders
// in production — needed for the focus-trap/iframe-boundary test below to
// exercise real iframe-bearing markup rather than a div stand-in.
vi.mock('@stripe/react-stripe-js', () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements">{children}</div>,
  PaymentElement: () => <iframe data-testid="payment-element" title="Payment Element" />,
  ExpressCheckoutElement: () => <iframe title="Express Checkout" />,
  useStripe: () => ({ confirmPayment: confirmPaymentMock }),
  useElements: () => ({}),
}));

import { PaySheet } from '../pay-sheet';

// `as unknown as GuestTicket` (rather than the given spec's `as never`) —
// disclosed mock-plumbing adaptation: the additional tests below read
// `ticket.payment` to build a "flipped to paid" fixture, which a
// `never`-typed const can't support (property access on `never` doesn't
// type-check even though assigning a `never` value elsewhere always does).
const ticket = {
  payment: { status: 'none', base: 1500, tip: 0, tax: 105, fees: 0, total: 1605, currency: 'USD', tipPresets: [18, 20, 25] },
  branding: { primaryColor: '#ab6034', accentColor: '#ffc30c', displayName: 'Goldstar' },
} as unknown as GuestTicket;

describe('PaySheet', () => {
  it('selects a tip, creates checkout, mounts Payment Element with the client secret', async () => {
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tip 20%' }));
    expect(screen.getByText('$3.21')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ token: 'AbCdEfGhIjKlMnOpQrStUv', tip: { kind: 'preset', percent: 20 } })
    );
    expect(await screen.findByTestId('payment-element')).toBeInTheDocument();
    expect(screen.getByText('$19.26')).toBeInTheDocument();
  });

  // Added for this task: tip math display — a different preset, "No tip",
  // and a typed custom amount must all flow through computeTip into the
  // visible Total row, same as goldstar-mobile's tip-selector does.
  it('updates the Total row for a different preset, No tip, and a custom amount', () => {
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    // Scoped to the "Total" row specifically (not just `getByText`) — with
    // "No tip" selected, the Total ($16.05) legitimately equals the Valet
    // subtotal row's own display (also $16.05, since tip is $0), so an
    // unscoped query would find two matches.
    const totalRow = () => screen.getByText('Total').closest('div') as HTMLElement;

    // Default selection is tipPresets[1] = 20%: subtotal 1605 + tip 321 = 1926.
    expect(within(totalRow()).getByText('$19.26')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tip 25%' }));
    expect(within(totalRow()).getByText('$20.06')).toBeInTheDocument(); // 1605 + round(1605*0.25)=401

    fireEvent.click(screen.getByRole('button', { name: 'No tip' }));
    expect(within(totalRow()).getByText('$16.05')).toBeInTheDocument(); // subtotal only, no tip

    fireEvent.click(screen.getByRole('button', { name: 'Custom tip' }));
    fireEvent.change(screen.getByLabelText('Custom tip amount'), { target: { value: '5.00' } });
    expect(within(totalRow()).getByText('$21.05')).toBeInTheDocument(); // 1605 + 500
  });

  // Added for this task: payment_already_paid renders info copy (not the
  // red error styling) and the sheet auto-closes itself.
  it('shows info copy and auto-closes on a payment_already_paid error', async () => {
    create.mockRejectedValueOnce(new PlatformError('payment_already_paid', 'already paid'));
    const onClose = vi.fn();
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    const notice = await screen.findByText('This ticket is already paid.');
    expect(notice).toHaveAttribute('role', 'status');
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2500 });
  });

  // Added for this task: auto-close once the LIVE ticket prop flips to a
  // paid-like status (the webhook-driven projection TicketView passes
  // down), independent of any client-side checkout state.
  it('auto-closes 1.5s after the ticket prop flips to a paid status', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={onClose} />);
    expect(onClose).not.toHaveBeenCalled();

    const paidTicket = { ...ticket, payment: { ...ticket.payment, status: 'paid' } };
    rerender(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={paidTicket} onClose={onClose} />);
    expect(screen.getByText('Paid — thank you')).toBeInTheDocument();

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2500 });
  });

  // Added for this task: Tab/Shift+Tab focus-trap basics — cycling wraps
  // at both ends of the dialog instead of escaping it.
  it('traps Tab focus inside the dialog, wrapping at both ends', () => {
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const focusable = dialog.querySelectorAll('button, input, [href], select, textarea, [tabindex]');
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  // Added for this task: focus moves into the dialog on open and is
  // restored to the opening control on close/unmount.
  it('moves focus into the dialog on open and restores it to the opener on unmount', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Pay & tip';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    expect(document.activeElement).not.toBe(opener);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  // F8 (final review): the opener can already be gone from the document by
  // the time this cleanup runs — the paid auto-close race, where TicketView
  // swaps "Pay & tip" for "Paid · thank you" (removing the button) BEFORE
  // this sheet's own 1.5s auto-close timer fires `onClose` and unmounts it.
  // `.focus()` on a detached node silently no-ops, so without the fallback
  // focus was dropped to `<body>`.
  it('F8: falls back to the page heading when the opener is already gone from the document by the time the sheet closes', () => {
    const heading = document.createElement('h1');
    heading.id = 'guest-page-heading';
    heading.tabIndex = -1;
    heading.textContent = 'Goldstar';
    document.body.appendChild(heading);

    const opener = document.createElement('button');
    opener.textContent = 'Pay & tip';
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    const { unmount } = render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    expect(document.activeElement).not.toBe(opener);

    // Simulates TicketView's conditional swap removing the button from the
    // DOM while the sheet is still open (the paid state renders "Paid ·
    // thank you" text instead), before this sheet itself unmounts.
    opener.remove();

    unmount();
    expect(document.activeElement).toBe(heading);
    heading.remove();
  });

  // Sanity check on the same fixture: when there's no page heading to fall
  // back to either (e.g. a test harness without BrandHeader mounted), the
  // cleanup must not throw — `document.getElementById(...)` returning `null`
  // is handled by the optional chain.
  it('F8: does not throw when neither the opener nor the fallback heading exist', () => {
    const opener = document.createElement('button');
    opener.textContent = 'Pay & tip';
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    opener.remove();
    expect(() => unmount()).not.toThrow();
  });

  // Added for this task: Stripe card errors ARE allowed to render
  // `error.message` verbatim (plan-sanctioned exception to the
  // never-show-raw-errors house rule) — every other error path goes
  // through errorCopy instead.
  it("shows confirmPayment's error.message verbatim when the card is declined", async () => {
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await screen.findByTestId('payment-element');

    confirmPaymentMock.mockResolvedValueOnce({ error: { message: 'Your card was declined.' } });
    fireEvent.click(screen.getByRole('button', { name: /Pay \$19\.26/ }));
    expect(await screen.findByText('Your card was declined.')).toBeInTheDocument();
  });

  // Fix round 1 (Ruling F): with `iframe` added to FOCUSABLE_SELECTOR, the
  // two Stripe iframes at step 2 are correctly counted as focusable stops
  // BEFORE the "Pay $X" button in DOM order — so Pay is no longer wrongly
  // treated as the trap's `first` boundary, and Shift+Tab pressed while
  // focused on Pay no longer gets force-wrapped to "Close". jsdom has no
  // native tab-order simulation, so this can't literally assert focus
  // lands INSIDE the iframe on a synthetic keydown — a real browser's own
  // native tab order does that on its own, unintercepted, for any
  // non-boundary Tab/Shift+Tab press. What the trap has to get right (and
  // what this proves) is that it doesn't misdirect that keypress anymore.
  it('Ruling F: Shift+Tab from Pay no longer force-wraps to Close once Stripe iframes count as focusable stops', async () => {
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={ticket} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    await screen.findByTestId('payment-element');

    const dialog = screen.getByRole('dialog');
    const iframes = dialog.querySelectorAll('iframe');
    expect(iframes).toHaveLength(2); // ExpressCheckoutElement + PaymentElement mocks

    const payButton = screen.getByRole('button', { name: /Pay \$19\.26/ });
    const closeButton = screen.getByRole('button', { name: 'Close' });
    payButton.focus();
    expect(document.activeElement).toBe(payButton);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).not.toBe(closeButton);
    expect(document.activeElement).toBe(payButton);

    // The TRUE first focusable (the express-checkout iframe, preceding
    // Pay in DOM order) still wraps correctly at the real boundary.
    const [expressCheckoutIframe] = Array.from(iframes) as HTMLIFrameElement[];
    expressCheckoutIframe.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
  });

  // Fix round 1 (Major-3 — regression test for the ref-based onClose fix):
  // the two "auto-close" tests above reuse the SAME `onClose` reference
  // across their `render`/`rerender` calls, so they'd pass identically
  // under the ORIGINAL given-deps version too (verified locally: see
  // task-3-report.md's "Fix round 1" section for the revert-and-rerun
  // result). This test simulates what `TicketView` actually does — a
  // BRAND NEW `onClose` closure on every re-render (its own
  // `onClose={() => setPay(false)}` is a fresh closure every live-ticket
  // snapshot) — while the sheet's auto-close timer and initial focus are
  // both live.
  it('regression: fresh onClose closures on every rerender neither re-steal focus nor reset the pending auto-close timer', () => {
    vi.useFakeTimers();
    try {
      const paidTicket = { ...ticket, payment: { ...ticket.payment, status: 'paid' } };
      let closeCount = 0;
      const makeOnClose = () => () => {
        closeCount += 1;
      };

      const { rerender } = render(
        <PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={paidTicket} onClose={makeOnClose()} />
      );

      // A focus target OUTSIDE the dialog, distinct from anything the
      // mount/focus-trap effect would auto-focus (the paid view's only
      // focusable control is "Close") — proves a re-running mount effect
      // (the given-deps bug) forces focus back in on every re-render,
      // while the fix (mount effect on `[]`) leaves it alone.
      const outside = document.createElement('button');
      outside.textContent = 'elsewhere';
      document.body.appendChild(outside);
      outside.focus();
      expect(document.activeElement).toBe(outside);

      // Four re-renders, 400ms apart in fake time, each with a BRAND NEW
      // onClose closure. Cumulative: 1600ms — enough that the timer armed
      // ONCE at mount (t=0, due at t=1500) should already have fired by
      // the last iteration under the fix.
      for (let i = 0; i < 4; i++) {
        act(() => {
          vi.advanceTimersByTime(400);
        });
        rerender(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={paidTicket} onClose={makeOnClose()} />);
      }

      expect(document.activeElement).toBe(outside);
      expect(closeCount).toBe(1);

      outside.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  // Added for this task (Fix round 1, Ruling G-3): the default tip must
  // land on a percent that's actually a member of `tipPresets` — a
  // single-preset operator config is schema-legal, and the old `?? 20`
  // fallback silently produced an unlabeled $0 default (no chip selected)
  // whenever that one preset wasn't 20.
  it('Ruling G-3: defaults to the only preset when tipPresets has a single entry', () => {
    const singlePresetTicket = { ...ticket, payment: { ...ticket.payment, tipPresets: [25] } };
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={singlePresetTicket} onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'Tip 25%' })).toHaveAttribute('aria-pressed', 'true');
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(totalRow).getByText('$20.06')).toBeInTheDocument(); // 1605 + round(1605*0.25)=401
  });

  it('Ruling G-3: defaults to No tip when the operator has zero configured tip presets', () => {
    const noPresetsTicket = { ...ticket, payment: { ...ticket.payment, tipPresets: [] } };
    render(<PaySheet token="AbCdEfGhIjKlMnOpQrStUv" ticket={noPresetsTicket} onClose={() => {}} />);

    expect(screen.getByRole('button', { name: 'No tip' })).toHaveAttribute('aria-pressed', 'true');
    const totalRow = screen.getByText('Total').closest('div') as HTMLElement;
    expect(within(totalRow).getByText('$16.05')).toBeInTheDocument(); // no tip → subtotal only
  });
});
