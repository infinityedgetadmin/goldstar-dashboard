import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Quote } from '@goldstar/platform';
import { QuoteView, useQuoteExpiry } from '../quote-view';

function Harness({ expiresAt }: { expiresAt?: string }) {
  const { expired, remainingMs } = useQuoteExpiry(expiresAt);
  const quote: Quote = {
    base: 2500,
    distanceMeters: 8046,
    durationSec: 900,
    amount: 4500,
    breakdown: [{ label: 'Base', amount: 2500 }],
    expiresAt,
  };
  return <QuoteView quote={quote} currency="USD" expired={expired} remainingMs={remainingMs} />;
}

describe('QuoteView / useQuoteExpiry', () => {
  it('renders amount, breakdown, distance, and duration', () => {
    render(<Harness />);
    expect(screen.getByText('$45.00')).toBeInTheDocument();
    expect(screen.getByText('Base')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('5.0 mi')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });

  it('shows no countdown when the quote has no expiresAt', () => {
    render(<Harness />);
    expect(screen.queryByText(/expires in/i)).toBeNull();
    expect(screen.queryByText(/quote has expired/i)).toBeNull();
  });

  it('shows a live countdown that ticks down and cleans up its interval on unmount', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<Harness expiresAt={new Date(Date.now() + 125_000).toISOString()} />);
      expect(screen.getByText('Expires in 2:05')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByText('Expires in 2:00')).toBeInTheDocument();

      const clearSpy = vi.spyOn(global, 'clearInterval');
      unmount();
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flips to expired once the countdown reaches zero, with no confirm-eligible content', () => {
    vi.useFakeTimers();
    try {
      render(<Harness expiresAt={new Date(Date.now() + 2000).toISOString()} />);
      expect(screen.getByText('Expires in 0:02')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByText(/quote has expired/i)).toBeInTheDocument();
      expect(screen.queryByText(/expires in/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats an already-expired quote as expired on first render, honestly, without waiting for a tick', () => {
    render(<Harness expiresAt={new Date(Date.now() - 1000).toISOString()} />);
    expect(screen.getByText(/quote has expired/i)).toBeInTheDocument();
  });

  it('treats an unparseable expiresAt as no deadline rather than crashing', () => {
    render(<Harness expiresAt="not-a-date" />);
    expect(screen.queryByText(/expires in/i)).toBeNull();
    expect(screen.queryByText(/quote has expired/i)).toBeNull();
    expect(screen.getByText('$45.00')).toBeInTheDocument();
  });

  // Addendum round (v0.3.9): the resume-quote path needs a destination shown, since a resumed
  // page has no visible address input the way the fresh-request flow does.
  it('renders the destination when provided', () => {
    const quote: Quote = { base: 2500, distanceMeters: 8046, durationSec: 900, amount: 4500, breakdown: [{ label: 'Base', amount: 2500 }] };
    render(<QuoteView quote={quote} currency="USD" expired={false} remainingMs={null} destination="123 Elm St, Indianapolis" />);
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('123 Elm St, Indianapolis')).toBeInTheDocument();
  });

  it('renders no destination section when omitted', () => {
    render(<Harness />);
    expect(screen.queryByText('To')).toBeNull();
  });
});
