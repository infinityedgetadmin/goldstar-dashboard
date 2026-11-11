import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { VenueProvider, useVenue } from '../venue-context';
import { VenueSwitcher } from '../venue-switcher';

function venue(id: string, name: string): Venue {
  return { id, name, operatorId: 'op1', type: 'restaurant', status: 'active' } as unknown as Venue;
}

/** Renders the switcher plus a readout of what the shell's context currently reports. */
function Harness({ venues, loading = false }: { venues: Venue[]; loading?: boolean }) {
  return (
    <VenueProvider venues={venues} loading={loading}>
      <VenueSwitcher />
      <Readout />
    </VenueProvider>
  );
}

function Readout() {
  const { venue: active, venues, loading } = useVenue();
  return (
    <div>
      <span data-testid="active">{active?.name ?? 'none'}</span>
      <span data-testid="active-id">{active?.id ?? 'none'}</span>
      <span data-testid="count">{venues.length}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

/** Lets a test call `setVenueId` directly, bypassing the `<select>`'s own option list. */
function ForeignSetter({ id }: { id: string }) {
  const { setVenueId } = useVenue();
  return (
    <button type="button" onClick={() => setVenueId(id)}>
      set foreign venue
    </button>
  );
}

const GRILL = venue('v1', 'The Grill');
const ROOFTOP = venue('v2', 'Rooftop');
const TERRACE = venue('v3', 'Terrace');

describe('VenueSwitcher', () => {
  it('renders nothing at all for a single-venue user', () => {
    render(<Harness venues={[GRILL]} />);
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
    // ...and the shell still has an active venue for the rest of the portal to scope to.
    expect(screen.getByTestId('active')).toHaveTextContent('The Grill');
  });

  it('renders nothing when the claim grants no venues', () => {
    render(<Harness venues={[]} />);
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('active')).toHaveTextContent('none');
  });

  it('SECURITY: a two-venue user is offered exactly their two claimed venues', () => {
    render(<Harness venues={[GRILL, ROOFTOP]} />);
    const select = screen.getByRole('combobox', { name: /venue/i });
    const options = screen.getAllByRole('option').map((o) => o.textContent);

    expect(select).toBeInTheDocument();
    expect(options).toEqual(['The Grill', 'Rooftop']);
    expect(options).toHaveLength(2);
    expect(screen.queryByRole('option', { name: 'Terrace' })).not.toBeInTheDocument();
  });

  it('defaults to the first claimed venue', () => {
    render(<Harness venues={[ROOFTOP, GRILL]} />);
    expect(screen.getByTestId('active')).toHaveTextContent('Rooftop');
    expect(screen.getByRole('combobox', { name: /venue/i })).toHaveValue('v2');
  });

  it('switching the select changes the shell context every screen reads', () => {
    render(<Harness venues={[GRILL, ROOFTOP]} />);
    const select = screen.getByRole('combobox', { name: /venue/i });
    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');

    fireEvent.change(select, { target: { value: 'v2' } });

    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');
    expect(screen.getByTestId('active')).toHaveTextContent('Rooftop');
    expect(select).toHaveValue('v2');
  });

  it('switches back to the first venue again', () => {
    render(<Harness venues={[GRILL, ROOFTOP]} />);
    const select = screen.getByRole('combobox', { name: /venue/i });

    fireEvent.change(select, { target: { value: 'v2' } });
    fireEvent.change(select, { target: { value: 'v1' } });

    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');
  });

  it('offers a third venue only when the claim actually carries it', () => {
    const { rerender } = render(<Harness venues={[GRILL, ROOFTOP]} />);
    expect(screen.getAllByRole('option')).toHaveLength(2);

    rerender(<Harness venues={[GRILL, ROOFTOP, TERRACE]} />);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['The Grill', 'Rooftop', 'Terrace']);
  });
});

describe('VenueProvider', () => {
  it('SECURITY: refuses a venue ID outside the claimed set', () => {
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]}>
        <ForeignSetter id="v9-not-mine" />
        <Readout />
      </VenueProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: /set foreign venue/i }));

    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');
    expect(screen.getByTestId('active-id')).not.toHaveTextContent('v9-not-mine');
  });

  it('SECURITY: falls back to a claimed venue when the claim shrinks under an active selection', () => {
    const { rerender } = render(
      <VenueProvider venues={[GRILL, ROOFTOP]}>
        <VenueSwitcher />
        <Readout />
      </VenueProvider>
    );
    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });
    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');

    // The host is removed from Rooftop: their claim now carries only The Grill.
    rerender(
      <VenueProvider venues={[GRILL]}>
        <VenueSwitcher />
        <Readout />
      </VenueProvider>
    );

    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');
    expect(screen.queryByRole('combobox', { name: /venue/i })).not.toBeInTheDocument();
  });

  it('passes its loading flag through to consumers', () => {
    render(<Harness venues={[]} loading />);
    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('useVenue() throws outside the provider rather than silently returning an unscoped value', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Readout />)).toThrow(/must be called within a <VenueProvider>/);
    spy.mockRestore();
  });
});

describe('VenueProvider: remembered selection', () => {
  const KEY = 'gs:venue:selected:u1';

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('seeds the active venue from storage when the stored id is claimed', () => {
    window.localStorage.setItem(KEY, 'v2');
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]} storageKey={KEY}>
        <Readout />
      </VenueProvider>
    );
    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');
  });

  it('writes the selection through to storage', () => {
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]} storageKey={KEY}>
        <VenueSwitcher />
        <Readout />
      </VenueProvider>
    );
    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });
    expect(window.localStorage.getItem(KEY)).toBe('v2');
  });

  it('SECURITY: never writes a venue outside the claimed set to storage', () => {
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]} storageKey={KEY}>
        <ForeignSetter id="v9-not-mine" />
        <Readout />
      </VenueProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: /set foreign venue/i }));
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');
  });

  it('SECURITY: a hand-edited storage value outside the claim falls back to a claimed venue', () => {
    window.localStorage.setItem(KEY, 'v9-not-mine');
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]} storageKey={KEY}>
        <Readout />
      </VenueProvider>
    );
    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');
  });

  it('re-reads storage when the session — and therefore the key — changes', () => {
    window.localStorage.setItem(KEY, 'v2');
    window.localStorage.setItem('gs:venue:selected:u2', 'v3');

    const { rerender } = render(
      <VenueProvider venues={[GRILL, ROOFTOP, TERRACE]} storageKey={KEY}>
        <Readout />
      </VenueProvider>
    );
    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');

    rerender(
      <VenueProvider venues={[GRILL, ROOFTOP, TERRACE]} storageKey="gs:venue:selected:u2">
        <Readout />
      </VenueProvider>
    );
    expect(screen.getByTestId('active-id')).toHaveTextContent('v3');
  });

  it('keeps the selection in memory only when no storage key is given', () => {
    render(
      <VenueProvider venues={[GRILL, ROOFTOP]}>
        <VenueSwitcher />
        <Readout />
      </VenueProvider>
    );
    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });

    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');
    expect(window.localStorage.length).toBe(0);
  });

  it('still works when localStorage throws (private browsing, blocked site data)', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    render(
      <VenueProvider venues={[GRILL, ROOFTOP]} storageKey={KEY}>
        <VenueSwitcher />
        <Readout />
      </VenueProvider>
    );
    expect(screen.getByTestId('active-id')).toHaveTextContent('v1');

    fireEvent.change(screen.getByRole('combobox', { name: /venue/i }), { target: { value: 'v2' } });
    expect(screen.getByTestId('active-id')).toHaveTextContent('v2');

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
