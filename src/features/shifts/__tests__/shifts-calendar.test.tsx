import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Shift } from '@goldstar/platform';
import { ShiftsCalendar } from '../shifts-calendar';

const TZ = 'America/Indiana/Indianapolis';

function shift(over: Partial<Shift> = {}): Shift {
  return {
    id: 'shift1',
    operatorId: 'goldstar',
    venueId: 'v1',
    date: '2026-08-24', // a Monday — weekStart below
    startsAt: '2026-08-24T21:00:00.000Z',
    endsAt: '2026-08-25T03:00:00.000Z',
    status: 'planned',
    assignments: [],
    notes: '',
    assignedUids: ['att1'],
    source: { provider: 'internal' },
    ...over,
  };
}

const STAFF_BY_UID = new Map([['att1', { displayName: 'Ana' }]]);

describe('ShiftsCalendar', () => {
  it('places a shift under its own date column with its venue-local time range', () => {
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[shift()]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={() => {}} />);
    expect(screen.getByText('5:00 PM–11:00 PM')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('shows "No shifts" for a day with none', () => {
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={() => {}} />);
    expect(screen.getAllByText('No shifts')).toHaveLength(7);
  });

  it('clicking a shift card calls onSelectShift with that shift', () => {
    const onSelectShift = vi.fn();
    const s = shift();
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[s]} staffByUid={STAFF_BY_UID} onSelectShift={onSelectShift} onCreateShift={() => {}} />);
    fireEvent.click(screen.getByText('5:00 PM–11:00 PM'));
    expect(onSelectShift).toHaveBeenCalledWith(s);
  });

  it('clicking a day\'s add button calls onCreateShift with that day\'s date', () => {
    const onCreateShift = vi.fn();
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={onCreateShift} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add shift on 2026-08-24' }));
    expect(onCreateShift).toHaveBeenCalledWith('2026-08-24');
  });

  it('shows an "Unassigned" label for a shift with no assignees', () => {
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[shift({ assignedUids: [] })]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={() => {}} />);
    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('shows a "Synced" badge for an externally-sourced shift', () => {
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[shift({ source: { provider: 'ical', externalId: 'x' } })]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={() => {}} />);
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });

  it('sorts multiple shifts on the same day by start time', () => {
    const later = shift({ id: 'later', startsAt: '2026-08-24T23:00:00.000Z', endsAt: '2026-08-25T03:00:00.000Z' });
    const earlier = shift({ id: 'earlier', startsAt: '2026-08-24T15:00:00.000Z', endsAt: '2026-08-24T21:00:00.000Z' });
    render(<ShiftsCalendar weekStart="2026-08-24" timezone={TZ} shifts={[later, earlier]} staffByUid={STAFF_BY_UID} onSelectShift={() => {}} onCreateShift={() => {}} />);
    const cards = screen.getAllByText(/–/, { selector: 'p' });
    expect(cards[0]).toHaveTextContent('11:00 AM–5:00 PM'); // earlier: 15:00Z -> 11:00 AM EDT
    expect(cards[1]).toHaveTextContent('7:00 PM–11:00 PM'); // later: 23:00Z -> 7:00 PM EDT
  });
});
