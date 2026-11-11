'use client';

import { useEffect, useId, useRef } from 'react';
import { Heading } from '@/components/ui/typography';

/**
 * Shared dialog a11y shell for the drive-home and ride request sheets —
 * extracted from `guest-pay/pay-sheet.tsx`'s inline dialog markup (Task 3)
 * so `DriveHomeSheet` and `RideSheet` don't each duplicate the focus trap /
 * Escape / restore-to-opener / aria-live wiring byte-for-byte. Same hardened
 * patterns as PaySheet, including its iframe fix (Ruling F): `iframe` is in
 * `FOCUSABLE_SELECTOR` because the Payment Element/Express Checkout render
 * as cross-origin `<iframe>`s with no `href`/`tabindex` of their own — see
 * pay-sheet.tsx's own comment for the full boundary-math explanation this
 * mirrors verbatim.
 */
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface DialogShellProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Rendered inside the aria-live region, above `children` — e.g. a step announcement. */
  liveAnnouncement?: string;
}

export function DialogShell({ title, onClose, children, liveAnnouncement }: DialogShellProps) {
  const headingId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Mount-only effect (same reasoning as PaySheet's): reads `onClose`
  // through the ref above so a fresh `onClose` closure on every parent
  // re-render can't re-run this and yank focus back to the first control
  // mid-interaction, or restore-to-opener prematurely.
  useEffect(() => {
    openerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    const focusables = getFocusableElements(containerRef.current);
    (focusables[0] ?? containerRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = getFocusableElements(containerRef.current);
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openerRef.current?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg-overlay p-4 motion-safe:animate-fade-in sm:items-center"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl bg-bg-primary p-6 motion-safe:animate-slide-up"
        onClick={(event) => event.stopPropagation()}
      >
        <Heading id={headingId} level={2} variant="heading-sm">
          {title}
        </Heading>

        <div aria-live="polite" className="mt-4 flex flex-1 flex-col gap-4">
          {liveAnnouncement ? <span className="sr-only">{liveAnnouncement}</span> : null}
          {children}
        </div>

        <button className="mt-4 min-h-11 w-full py-3 text-ui-md text-text-tertiary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
