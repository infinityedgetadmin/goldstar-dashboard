import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mapsAutocomplete = vi.fn(async () => ({
  suggestions: [
    { id: 'a1', label: '100 Monument Cir, Indianapolis', geo: { lat: 39.768, lng: -86.158 } },
    { id: 'a2', label: '100 N Meridian St, Indianapolis', geo: { lat: 39.77, lng: -86.157 } },
    // No `geo` — the real mapsAutocomplete schema marks it optional; must
    // be filtered out rather than offered as a selectable-but-broken row.
    { id: 'a3', label: 'No-geo suggestion' },
  ],
}));
vi.mock('@/lib/public/callables', () => ({ guestCall: () => mapsAutocomplete }));

import { AddressAutocomplete } from '../address-autocomplete';

describe('AddressAutocomplete', () => {
  it('debounces the query, calls mapsAutocomplete with a sessionToken, and filters out geo-less suggestions', async () => {
    const onSelect = vi.fn();
    render(<AddressAutocomplete label="Destination" onSelect={onSelect} />);
    const input = screen.getByLabelText('Destination');

    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.change(input, { target: { value: '100' } });

    // Debounced: only the FINAL value should ever reach the callable.
    await waitFor(() => expect(mapsAutocomplete).toHaveBeenCalledTimes(1));
    expect(mapsAutocomplete).toHaveBeenCalledWith(
      expect.objectContaining({ query: '100', sessionToken: expect.any(String) })
    );

    expect(await screen.findByText('100 Monument Cir, Indianapolis')).toBeInTheDocument();
    expect(screen.getByText('100 N Meridian St, Indianapolis')).toBeInTheDocument();
    expect(screen.queryByText('No-geo suggestion')).toBeNull();
  });

  it('exposes combobox/listbox a11y roles and updates aria-expanded', async () => {
    render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Destination' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: '100' } });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('listbox', { name: 'Destination' })).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('supports ArrowDown/ArrowUp to move the active descendant and Enter to select it', async () => {
    const onSelect = vi.fn();
    render(<AddressAutocomplete label="Destination" onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: 'Destination' });
    fireEvent.change(input, { target: { value: '100' } });
    await screen.findByText('100 Monument Cir, Indianapolis');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith({
      address: '100 Monument Cir, Indianapolis',
      geo: { lat: 39.768, lng: -86.158 },
      placeId: 'a1',
    });
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the listbox on Escape without selecting', async () => {
    render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Destination' });
    fireEvent.change(input, { target: { value: '100' } });
    await screen.findByText('100 Monument Cir, Indianapolis');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  // Fix round 1 (Major-3): Escape while the listbox is open must not bubble
  // past this component — a `document`-level listener (e.g. DialogShell's
  // Escape-to-close handler) must never see it. When the listbox is
  // already closed, Escape must bubble normally so a document listener
  // still receives it (WAI-ARIA APG: first Escape closes the popup, a
  // second closes the containing dialog).
  it('Major-3: Escape stops propagating to a document-level listener while the listbox is open, but not once it is closed', async () => {
    const documentKeydown = vi.fn();
    document.addEventListener('keydown', documentKeydown);
    try {
      render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
      const input = screen.getByRole('combobox', { name: 'Destination' });
      fireEvent.change(input, { target: { value: '100' } });
      await screen.findByText('100 Monument Cir, Indianapolis');

      fireEvent.keyDown(input, { key: 'Escape' });
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(documentKeydown).not.toHaveBeenCalled();

      // Listbox is now closed — a second Escape must reach the document.
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(documentKeydown).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', documentKeydown);
    }
  });

  // Fix round 1 (Major-2): a slower response for an EARLIER query must not
  // overwrite a faster response for a LATER, current query — reproduces
  // the reviewer's exact scenario (guest pauses past the debounce twice,
  // the first request's response arrives after the second's).
  // Real timers deliberately, not `vi.useFakeTimers()`: fake timers here
  // interact badly with `@testing-library`'s async `waitFor`/`findBy`
  // machinery across the REST of this file's tests (observed directly —
  // an earlier fake-timer version of this test left every subsequent test
  // in this file timing out even after `vi.useRealTimers()`). Deferred
  // promises give full control over resolution ORDER regardless of real
  // elapsed time, which is the only thing this test actually needs to
  // reproduce the race; the two real ~300ms debounce waits below are the
  // tradeoff for that isolation.
  it(
    'Major-2: drops a stale response for an earlier query once a later query has already applied',
    async () => {
      // This mock accumulates calls across the whole file (no clearMocks
      // configured) — clear its history so the count assertions below
      // reflect only this test's two requests.
      mapsAutocomplete.mockClear();
      type MapsAutocompleteResult = Awaited<ReturnType<typeof mapsAutocomplete>>;
      let resolveFirst!: (v: MapsAutocompleteResult) => void;
      let resolveSecond!: (v: MapsAutocompleteResult) => void;
      mapsAutocomplete
        .mockImplementationOnce(() => new Promise<MapsAutocompleteResult>((r) => (resolveFirst = r)))
        .mockImplementationOnce(() => new Promise<MapsAutocompleteResult>((r) => (resolveSecond = r)));

      render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
      const input = screen.getByLabelText('Destination');

      fireEvent.change(input, { target: { value: '1' } });
      await waitFor(() => expect(mapsAutocomplete).toHaveBeenCalledTimes(1));

      fireEvent.change(input, { target: { value: '100' } });
      await waitFor(() => expect(mapsAutocomplete).toHaveBeenCalledTimes(2));

      // The NEWER request ('100') resolves first.
      await act(async () => {
        resolveSecond({ suggestions: [{ id: 'new1', label: 'CURRENT RESULT', geo: { lat: 1, lng: 1 } }] });
      });
      expect(await screen.findByText('CURRENT RESULT')).toBeInTheDocument();

      // The OLDER, now-stale request ('1') resolves after — must be dropped.
      await act(async () => {
        resolveFirst({ suggestions: [{ id: 'old1', label: 'STALE RESULT', geo: { lat: 2, lng: 2 } }] });
      });
      expect(screen.queryByText('STALE RESULT')).toBeNull();
      expect(screen.getByText('CURRENT RESULT')).toBeInTheDocument();
    },
    10000
  );

  it('seeds the input from defaultQuery and auto-searches it once on mount', async () => {
    render(<AddressAutocomplete label="Pickup" defaultQuery="100" onSelect={vi.fn()} />);
    expect(screen.getByLabelText('Pickup')).toHaveValue('100');
    await waitFor(() => expect(mapsAutocomplete).toHaveBeenCalledWith(expect.objectContaining({ query: '100' })));
    expect(await screen.findByText('100 Monument Cir, Indianapolis')).toBeInTheDocument();
  });

  it('passes proximity through to the callable when provided', async () => {
    render(<AddressAutocomplete label="Destination" proximity={{ lat: 1, lng: 2 }} onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '100' } });
    await waitFor(() =>
      expect(mapsAutocomplete).toHaveBeenCalledWith(expect.objectContaining({ proximity: { lat: 1, lng: 2 } }))
    );
  });

  it('shows sanitized error copy and closes the list when the callable rejects', async () => {
    mapsAutocomplete.mockRejectedValueOnce(new Error('boom'));
    render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '100' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Search unavailable. Please try again.');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('clears suggestions when the query is emptied', async () => {
    render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
    const input = screen.getByLabelText('Destination');
    fireEvent.change(input, { target: { value: '100' } });
    await screen.findByText('100 Monument Cir, Indianapolis');

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  // F1 (final review): `onEdited` reports the "guest diverged from their
  // selection" transition so a parent (RideSheet) can invalidate a stale
  // pickup/dropoff selection before it's submitted under displayed text
  // that contradicts it.
  describe('onEdited (F1)', () => {
    it('does not fire for typing before any selection has been made', async () => {
      const onEdited = vi.fn();
      render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} onEdited={onEdited} />);
      fireEvent.change(screen.getByLabelText('Destination'), { target: { value: '100' } });
      await screen.findByText('100 Monument Cir, Indianapolis');
      expect(onEdited).not.toHaveBeenCalled();
    });

    it('fires once when the input is edited away from a selected label, and not again on further keystrokes while still diverged', async () => {
      const onEdited = vi.fn();
      const onSelect = vi.fn();
      render(<AddressAutocomplete label="Destination" onSelect={onSelect} onEdited={onEdited} />);
      const input = screen.getByLabelText('Destination');
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.click(await screen.findByText('100 Monument Cir, Indianapolis'));
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(input).toHaveValue('100 Monument Cir, Indianapolis');

      fireEvent.change(input, { target: { value: '100 Monument Cir, Indianapolis X' } });
      expect(onEdited).toHaveBeenCalledTimes(1);

      // Still diverged — further typing must not re-fire it.
      fireEvent.change(input, { target: { value: '100 Monument Cir, Indianapolis XY' } });
      expect(onEdited).toHaveBeenCalledTimes(1);
    });

    it('fires when the field is cleared entirely after a selection', async () => {
      const onEdited = vi.fn();
      render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} onEdited={onEdited} />);
      const input = screen.getByLabelText('Destination');
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.click(await screen.findByText('100 Monument Cir, Indianapolis'));

      fireEvent.change(input, { target: { value: '' } });
      expect(onEdited).toHaveBeenCalledTimes(1);
    });

    it('selecting again after an edit re-establishes the baseline (no further onEdited until the NEXT edit)', async () => {
      const onEdited = vi.fn();
      const onSelect = vi.fn();
      render(<AddressAutocomplete label="Destination" onSelect={onSelect} onEdited={onEdited} />);
      const input = screen.getByLabelText('Destination');
      fireEvent.change(input, { target: { value: '100' } });
      fireEvent.click(await screen.findByText('100 Monument Cir, Indianapolis'));

      fireEvent.change(input, { target: { value: '100 N' } });
      expect(onEdited).toHaveBeenCalledTimes(1);
      fireEvent.click(await screen.findByText('100 N Meridian St, Indianapolis'));
      expect(onSelect).toHaveBeenLastCalledWith({
        address: '100 N Meridian St, Indianapolis',
        geo: { lat: 39.77, lng: -86.157 },
        placeId: 'a2',
      });
      // Still just the one onEdited call from the earlier divergence — selecting doesn't fire it.
      expect(onEdited).toHaveBeenCalledTimes(1);

      // A NEW edit against the new baseline fires it again.
      fireEvent.change(input, { target: { value: '100 N Meridian St, Indianapolis, unit 2' } });
      expect(onEdited).toHaveBeenCalledTimes(2);
    });
  });

  // Deferred item (d), final review: `select()` now bumps `sequenceRef`
  // (same counter the Major-2 stale-response guard reads) so a request
  // already in flight at the moment of selection — e.g. the guest clicked a
  // suggestion still on screen from an earlier completed search while a
  // newer debounced search they'd already started typing is mid-flight —
  // can't resolve afterward and reopen the dropdown out from under the
  // selection they just made.
  it(
    'deferred (d): a response in flight at the moment of selection cannot resolve afterward and reopen the dropdown',
    async () => {
      mapsAutocomplete.mockClear();
      type MapsAutocompleteResult = Awaited<ReturnType<typeof mapsAutocomplete>>;
      let resolvePending!: (v: MapsAutocompleteResult) => void;

      render(<AddressAutocomplete label="Destination" onSelect={vi.fn()} />);
      const input = screen.getByLabelText('Destination');

      // First search resolves normally, giving a clickable, currently-visible suggestion.
      fireEvent.change(input, { target: { value: '100' } });
      await screen.findByText('100 Monument Cir, Indianapolis');
      expect(mapsAutocomplete).toHaveBeenCalledTimes(1);

      // A second keystroke starts a NEW debounced search that this test holds
      // pending — `runSearch` doesn't clear the old suggestions until this
      // resolves, so the first search's options stay visible and clickable.
      mapsAutocomplete.mockImplementationOnce(() => new Promise<MapsAutocompleteResult>((r) => (resolvePending = r)));
      fireEvent.change(input, { target: { value: '100 M' } });
      await waitFor(() => expect(mapsAutocomplete).toHaveBeenCalledTimes(2));
      expect(screen.getByText('100 Monument Cir, Indianapolis')).toBeInTheDocument(); // still showing the stale list

      // Guest clicks the still-visible (stale) suggestion while the second request is in flight.
      fireEvent.click(screen.getByText('100 Monument Cir, Indianapolis'));
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(input).toHaveValue('100 Monument Cir, Indianapolis');

      // The in-flight request now resolves — must be dropped, not reopen the dropdown.
      await act(async () => {
        resolvePending({ suggestions: [{ id: 'late1', label: 'LATE RESULT', geo: { lat: 5, lng: 5 } }] });
      });
      expect(screen.queryByRole('listbox')).toBeNull();
      expect(screen.queryByText('LATE RESULT')).toBeNull();
      expect(input).toHaveValue('100 Monument Cir, Indianapolis');
    },
    10000
  );
});
