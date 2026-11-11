'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { guestCall } from '@/lib/public/callables';

export interface AddressSuggestion {
  address: string;
  geo: { lat: number; lng: number };
  placeId?: string;
}

export interface AddressAutocompleteProps {
  label: string;
  /** Seeds the input's initial text (e.g. the venue name for a ride pickup) without pre-selecting a geo. */
  defaultQuery?: string;
  proximity?: { lat: number; lng: number };
  onSelect: (suggestion: AddressSuggestion) => void;
  /**
   * Final review (F1): fired once the guest edits the input text away from a
   * previously-selected suggestion's label — including clearing it to empty
   * — so the parent knows the selection it's holding (e.g. RideSheet's
   * `pickup`/`dropoff`) no longer matches what's on screen and must be
   * invalidated. Not fired for typing that happens before any selection has
   * been made, and not re-fired on every further keystroke once already
   * diverged (see `select()`'s reset of `selectedLabelRef`) — this is an
   * edge-triggered "your selection is now stale" signal, not a general
   * onChange.
   */
  onEdited?: () => void;
}

const DEBOUNCE_MS = 300;

/**
 * Guest-facing address combobox against the `mapsAutocomplete` callable.
 * Verified against the installed `@goldstar/platform@0.3.5` schema: input is
 * `{ query, sessionToken, proximity? }` (not just `{ query }` as a naive
 * read of the task brief's own test — which never asserts on
 * `mapsAutocomplete`'s call args — might suggest), output is
 * `{ suggestions: [{ id, label, geo? }] }`. `geo` is optional on a
 * suggestion in the real schema; a suggestion with no geo is filtered out of
 * the rendered list here rather than surfaced as a selectable-but-broken
 * option, since every caller of this component (`destination`/`pickup`/
 * `dropoff`) requires a concrete `{ lat, lng }` downstream.
 *
 * role="combobox" + aria-expanded + an associated role="listbox" of
 * role="option" rows, ArrowDown/ArrowUp to move the active descendant,
 * Enter to select it, Escape to close. `sessionToken` is a fresh
 * `crypto.randomUUID()` per mount (i.e. per "open" of this field) — Maps
 * Platform's session-token billing model bills autocomplete + place-details
 * calls as one session when they share a token.
 */
export function AddressAutocomplete({ label, defaultQuery, proximity, onSelect, onEdited }: AddressAutocompleteProps) {
  const inputId = useId();
  const listboxId = useId();
  const sessionTokenRef = useRef(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Fix round 1 (Major-2): the debounce timer only guards against a NEW
  // keystroke while a request hasn't fired yet — once two requests are
  // both in flight (guest pauses past 300ms, then resumes typing and
  // pauses again before the first response lands), nothing previously
  // stopped a slower response for the OLDER query from overwriting a
  // faster response for the CURRENT query. `sequenceRef` is bumped right
  // before each request is sent; a response only applies if its id still
  // matches the latest bumped value when it resolves/rejects.
  const sequenceRef = useRef(0);
  // Final review (F1): the label of the suggestion most recently passed to
  // `onSelect`, or `null` when there is no active selection (nothing picked
  // yet, or it was already invalidated by a prior edit). `handleChange`
  // compares the new value against this to detect the "guest edited after
  // selecting" transition and fire `onEdited`.
  const selectedLabelRef = useRef<string | null>(null);

  const [query, setQuery] = useState(defaultQuery ?? '');
  const [suggestions, setSuggestions] = useState<Array<{ id: string; label: string; geo: { lat: number; lng: number } }>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);

  const runSearch = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      sequenceRef.current += 1; // invalidates any request still in flight for a prior query
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const requestId = ++sequenceRef.current;
      try {
        const res = await guestCall('mapsAutocomplete')({
          query: q,
          sessionToken: sessionTokenRef.current,
          ...(proximity ? { proximity } : {}),
        });
        if (requestId !== sequenceRef.current) return; // a newer request has already resolved/started
        const withGeo = res.suggestions.filter(
          (s): s is { id: string; label: string; geo: { lat: number; lng: number } } => Boolean(s.geo)
        );
        setSuggestions(withGeo);
        setOpen(withGeo.length > 0);
        setActiveIndex(-1);
        setError(null);
      } catch {
        if (requestId !== sequenceRef.current) return;
        // F9 (final review nit): both branches of the old instanceof-PlatformError
        // ternary produced the identical string — there's no case-specific copy to
        // preserve, so this is just the flat message. `e` is unused now.
        setError('Search unavailable. Please try again.');
        setSuggestions([]);
        setOpen(false);
      }
    }, DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Ride pickup's "venue default" (RideSheet passes `defaultQuery={ticket.
  // venueName}`) needs a resolvable, geo-bearing suggestion available
  // without the guest having to retype the venue name first — so a
  // non-empty `defaultQuery` runs its own search once on mount, same
  // debounce path as a manual edit.
  useEffect(() => {
    if (defaultQuery) runSearch(defaultQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    // F1 (final review): the guest is diverging from a selection they already
    // made (editing the text, or clearing it) — that selection is now stale
    // and the parent must be told to drop it. Edge-triggered: reset
    // `selectedLabelRef` to `null` immediately so further keystrokes while
    // still diverged don't keep re-firing `onEdited`.
    if (selectedLabelRef.current !== null && value !== selectedLabelRef.current) {
      selectedLabelRef.current = null;
      onEdited?.();
    }
    runSearch(value);
  };

  const select = (suggestion: { id: string; label: string; geo: { lat: number; lng: number } }) => {
    // Deferred item (d, final review): bump the sequence BEFORE resetting UI
    // state so a request already in flight for the pre-selection query can't
    // resolve afterward and reopen the dropdown (its `requestId !==
    // sequenceRef.current` check in `runSearch` now fails, same guard the
    // Major-2 stale-response fix relies on for ordinary typing).
    sequenceRef.current += 1;
    selectedLabelRef.current = suggestion.label;
    setQuery(suggestion.label);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    onSelect({ address: suggestion.label, geo: suggestion.geo, placeId: suggestion.id });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0) {
        event.preventDefault();
        select(suggestions[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      // Fix round 1 (Major-3): without stopPropagation, this native keydown
      // kept bubbling to DialogShell's `document`-level Escape listener —
      // one Escape press closed the suggestion listbox AND the whole
      // sheet, discarding the guest's in-progress request. Only reached
      // when the listbox is actually open (the early return above), so a
      // CLOSED listbox still lets Escape bubble up and close the sheet, as
      // the WAI-ARIA APG combobox pattern expects (first Escape closes the
      // popup, a second Escape closes the containing dialog).
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-ui-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </label>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
        value={query}
        onChange={(event) => handleChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        className="min-h-11 rounded-lg border-2 border-border bg-white px-4 py-3 text-body-md text-text-primary outline-none focus:border-primary-500"
      />
      {open ? (
        <ul id={listboxId} role="listbox" aria-label={label} className="rounded-lg border border-border bg-white shadow-sm">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select(suggestion)}
                className={`flex min-h-11 w-full items-center px-4 py-2.5 text-left text-body-sm ${
                  index === activeIndex ? 'bg-primary-50 text-primary-700' : 'text-text-primary'
                }`}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <span role="alert" className="text-ui-xs text-error-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}
