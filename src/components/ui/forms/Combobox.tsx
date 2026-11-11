'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Adapted from goldstar-web's `src/components/ui/forms/Combobox.tsx`
 * (task-1-report.md). Behavior (WAI-ARIA combobox + listbox pattern,
 * keyboard nav, commit-on-Enter, settle-on-blur) is unchanged from the
 * source. Disclosed styling changes: goldstar-web's source used a Font
 * Awesome chevron/check (`far fa-angle-down` / `far fa-check`) and its
 * legacy `.gs-combobox*`/`.form-control` template classes — this repo has
 * neither. Rewritten with `lucide-react` icons and tokens-styled Tailwind
 * classes matching `ui/forms/Input`.
 */
export interface ComboboxProps {
  /** id of the visible text input (labels point here). */
  id: string;
  /** Name of the hidden input that carries the committed value in FormData. */
  name: string;
  /** The selectable options, in display order. */
  options: readonly string[];
  /** Committed value. Always one of `options` or an empty string. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  /** id(s) for aria-describedby on the input. */
  describedBy?: string;
  /** Shown when the typed text matches nothing. */
  emptyMessage?: string;
  /** An option (e.g. "Other") that stays visible however the list is filtered. */
  alwaysShow?: string;
}

const normalise = (s: string) => s.trim().toLowerCase();

export const Combobox = ({
  id,
  name,
  options,
  value,
  onChange,
  placeholder,
  required,
  describedBy,
  emptyMessage = 'No match. Try another word.',
  alwaysShow,
}: ComboboxProps) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = `${useId()}-listbox`;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const { matches, filtered } = useMemo(() => {
    const q = normalise(query);
    if (!q || q === normalise(value)) return { matches: [...options], filtered: [...options] };
    const hits = options.filter((o) => normalise(o).includes(q));
    const listed = [...hits];
    if (alwaysShow && options.includes(alwaysShow) && !listed.includes(alwaysShow)) listed.push(alwaysShow);
    return { matches: hits, filtered: listed };
  }, [options, query, value, alwaysShow]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setQuery(next);
      setOpen(false);
      setActive(-1);
    },
    [onChange]
  );

  const settle = useCallback(() => {
    const exact = options.find((o) => normalise(o) === normalise(query));
    if (exact) {
      if (exact !== value) onChange(exact);
      setQuery(exact);
    } else {
      setQuery(value);
    }
    setOpen(false);
    setActive(-1);
  }, [options, query, value, onChange]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) settle();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, settle]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        setActive((i) => (filtered.length ? Math.min(i + 1, filtered.length - 1) : -1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        setActive((i) => (filtered.length ? Math.max(i - 1, 0) : -1));
        break;
      case 'Enter':
        if (open) {
          event.preventDefault();
          const pick = active >= 0 ? filtered[active] : matches.length === 1 ? matches[0] : undefined;
          if (pick) commit(pick);
        }
        break;
      case 'Escape':
        if (open) {
          event.preventDefault();
          settle();
        }
        break;
      case 'Tab':
        settle();
        break;
      default:
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={cn(
          'border-border text-text-primary block min-h-11 w-full rounded-lg border px-4 py-2.5 pr-10 font-sans text-body-md',
          'focus:border-primary-500 focus:ring-primary-200 transition-all duration-300 focus:ring-2 focus:outline-none'
        )}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `${listId}-opt-${active}` : undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        required={required}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <input type="hidden" name={name} value={value} />
      <button
        type="button"
        className="text-text-tertiary absolute inset-y-0 right-0 flex w-10 items-center justify-center"
        tabIndex={-1}
        aria-label={open ? 'Hide options' : 'Show options'}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            settle();
          } else {
            setOpen(true);
            inputRef.current?.focus();
          }
        }}
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Options"
          className="border-border absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="text-text-tertiary px-4 py-2 text-body-sm" role="presentation">
              {emptyMessage}
            </li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={option === value}
                className={cn(
                  'text-text-primary flex cursor-pointer items-center justify-between px-4 py-2 text-body-sm',
                  i === active && 'bg-primary-50'
                )}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(option)}
              >
                <span>{option}</span>
                {option === value && <Check className="text-primary-600 h-4 w-4" aria-hidden />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

export default Combobox;
