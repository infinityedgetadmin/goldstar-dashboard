'use client';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/forms';
import { Text } from '@/components/ui/typography';
import { callable } from '@/lib/firebase/callables';
import { cn } from '@/lib/utils';

export interface VenueAddress {
  address: string;
  geo: { lat: number; lng: number };
}

export interface VenueAddressFieldProps {
  label: string;
  /**
   * The committed selection, owned by the parent. Passing `null` after a selection existed — as
   * the parent does when it resets the form after a successful submit — clears the visible text
   * too. Without this the field kept showing the old address while the parent held `null`: the
   * host would see a filled destination, submit, and be told to pick one. Caught by this
   * component's own form test, not by reading.
   */
  value: VenueAddress | null;
  /** Biases suggestions toward the venue — a host's rides start where they are standing. */
  proximity?: { lat: number; lng: number };
  /** Fires with a concrete address+geo on selection, and with `null` once the text diverges from it. */
  onChange: (value: VenueAddress | null) => void;
  helperText?: string;
  error?: string;
}

const DEBOUNCE_MS = 300;

/**
 * Address picker for the venue portal, against the authenticated `mapsAutocomplete` callable.
 *
 * Deliberately NOT reusing `features/guest-requests/address-autocomplete.tsx`, despite the
 * overlap — that component calls through `guestCall`, i.e. the `(public)` surface's OWN
 * unauthenticated Firebase instance (`src/lib/public/callables.ts`). A venue_user is a signed-in
 * dashboard user; their calls must go through `firebase().functions` so their auth token travels
 * with the request. Importing the guest component here would also be the first `(app)` -> guest
 * feature import in the repo, which risks moving code between two chunk graphs the root-layout
 * split exists to keep apart. Two small components against one callable, rather than one
 * component against two Firebase instances.
 *
 * A suggestion with no `geo` is filtered out rather than shown as selectable-but-broken: the
 * contract's `dropoff` requires a concrete `{ lat, lng }`, so an option that cannot supply one is
 * not an option.
 */
export function VenueAddressField({ label, value, proximity, onChange, helperText, error }: VenueAddressFieldProps) {
  const [text, setText] = useState('');
  const [suggestions, setSuggestions] = useState<VenueAddress[]>([]);
  const [open, setOpen] = useState(false);
  const sessionTokenRef = useRef(crypto.randomUUID());
  // The label of the currently-committed selection, so typing away from it can invalidate the
  // parent's held value exactly once rather than on every keystroke. STATE, not a ref: this is
  // read during render by the external-clear check below, and a ref read during render is both a
  // React rule violation and genuinely unreliable (a ref mutation doesn't schedule the re-render
  // that would show its effect). Matches `useDoc`'s `subscribedPath` and `useClaimVenues`'s
  // `subscribedTarget`, the repo's other reset-on-prop-change sites.
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // An EXTERNAL clear (parent set `value` to null while we still hold a committed label) resets
  // the visible text. Distinguished from the user typing away from their own selection, which
  // clears `selectedLabel` itself before calling `onChange(null)` — that path must NOT wipe what
  // they are mid-way through typing. Render-phase, so no frame renders the stale address.
  if (value === null && selectedLabel !== null) {
    setSelectedLabel(null);
    setText('');
  }

  // Whether the current text is even worth a lookup. Derived rather than stored so the effect
  // below never has to `setSuggestions([])` to hide stale options — that synchronous
  // setState-in-effect is the cascading-render pattern this repo's other hooks were corrected
  // away from, and the same correction applies here.
  const query = text.trim();
  const queryIsSearchable = query.length >= 3 && query !== selectedLabel;

  useEffect(() => {
    if (!queryIsSearchable) return;
    const q = query;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await callable('mapsAutocomplete')({
            query: q,
            sessionToken: sessionTokenRef.current,
            ...(proximity ? { proximity } : {}),
          });
          if (cancelled) return;
          setSuggestions(
            res.suggestions
              .filter((s): s is typeof s & { geo: { lat: number; lng: number } } => s.geo !== undefined)
              .map((s) => ({ address: s.label, geo: s.geo })),
          );
          setOpen(true);
        } catch {
          // A failed lookup must not break the form — the host can still pick another suggestion
          // or retype. No toast: this fires on every keystroke pause and would be noise.
          if (!cancelled) setSuggestions([]);
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, queryIsSearchable, proximity]);

  const commit = (picked: VenueAddress) => {
    setSelectedLabel(picked.address);
    setText(picked.address);
    setSuggestions([]);
    setOpen(false);
    onChange(picked);
  };

  return (
    <div className="relative">
      <Input
        label={label}
        required
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (selectedLabel !== null && e.target.value !== selectedLabel) {
            setSelectedLabel(null);
            onChange(null);
          }
        }}
        helperText={helperText}
        error={error}
        fullWidth
      />
      {open && queryIsSearchable && suggestions.length > 0 ? (
        <ul
          aria-label={`${label} suggestions`}
          className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-bg-primary shadow-lg"
        >
          {suggestions.map((s) => (
            <li key={`${s.address}:${s.geo.lat},${s.geo.lng}`}>
              <button
                type="button"
                onClick={() => commit(s)}
                className={cn('flex min-h-11 w-full items-center px-3 text-left text-body-sm', 'hover:bg-bg-secondary')}
              >
                <Text as="span" size="sm">
                  {s.address}
                </Text>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
