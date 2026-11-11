import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Radio, ConciergeBell, Ticket } from 'lucide-react';

let pathname = '/venue';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { Sidebar, type NavItem } from '../sidebar';

/**
 * Mirrors `VENUE_NAV`'s shape: an index route whose href is a prefix of
 * every sibling's. `Live board` sets `exact`, the others don't.
 */
const venueNav: NavItem[] = [
  { label: 'Live board', href: '/venue', icon: Radio, exact: true },
  { label: 'Requests', href: '/venue/requests', icon: ConciergeBell },
];

const operatorNav: NavItem[] = [{ label: 'Tickets', href: '/tickets', icon: Ticket }];

function currentLabels() {
  return screen
    .getAllByRole('link')
    .filter((a) => a.getAttribute('aria-current') === 'page')
    .map((a) => a.textContent);
}

beforeEach(() => {
  pathname = '/venue';
});

describe('Sidebar active-item matching', () => {
  it('marks an exact item current on its own route', () => {
    render(<Sidebar nav={venueNav} />);
    expect(currentLabels()).toEqual(['Live board']);
  });

  it('does NOT mark an exact item current on a descendant route', () => {
    pathname = '/venue/requests';
    render(<Sidebar nav={venueNav} />);
    expect(currentLabels()).toEqual(['Requests']);
  });

  it('marks exactly one item current on a deeper descendant route', () => {
    pathname = '/venue/requests/new';
    render(<Sidebar nav={venueNav} />);
    expect(currentLabels()).toEqual(['Requests']);
  });

  it('keeps prefix matching for items that do not opt into exact', () => {
    pathname = '/tickets/abc123';
    render(<Sidebar nav={operatorNav} />);
    expect(currentLabels()).toEqual(['Tickets']);
  });

  it('marks nothing current on an unrelated route', () => {
    pathname = '/settings';
    render(<Sidebar nav={venueNav} />);
    expect(currentLabels()).toEqual([]);
  });

  it('calls onNavigate when a link is activated (mobile drawer close)', () => {
    const onNavigate = vi.fn();
    render(<Sidebar nav={venueNav} mobile onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('link', { name: 'Requests' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
