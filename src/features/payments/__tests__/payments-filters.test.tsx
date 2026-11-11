import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Venue } from '@goldstar/platform';
import { PaymentsFilters } from '../payments-filters';

const VENUE: Venue = { id: 'v1', operatorId: 'goldstar', name: 'St. Elmo', timezone: 'America/Indiana/Indianapolis' } as unknown as Venue;

describe('PaymentsFilters', () => {
  it('submits from/to as ISO day-boundaries and omits venueId/status when unset', () => {
    const onSearch = vi.fn();
    render(<PaymentsFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-23' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    const filters = onSearch.mock.calls[0]![0];
    expect(filters.from).toBe(new Date('2026-08-01T00:00:00').toISOString());
    expect(filters.to).toBe(new Date('2026-08-23T23:59:59.999').toISOString());
    expect(filters).not.toHaveProperty('venueId');
    expect(filters).not.toHaveProperty('status');
  });

  it('includes venueId and status once set', () => {
    const onSearch = vi.fn();
    render(<PaymentsFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.change(screen.getByLabelText('Venue'), { target: { value: 'v1' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'refunded' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    const filters = onSearch.mock.calls[0]![0];
    expect(filters).toMatchObject({ venueId: 'v1', status: 'refunded' });
  });

  it('the venue picker is hidden when the caller passes an empty restrictToVenueIds (e.g. a lead with no venues)', () => {
    render(<PaymentsFilters venues={[VENUE]} restrictToVenueIds={[]} onSearch={vi.fn()} />);
    expect(screen.queryByLabelText('Venue')).not.toBeInTheDocument();
  });

  it('the callable never sees a stray "method" filter — not part of the installed paymentsSearch contract', () => {
    const onSearch = vi.fn();
    render(<PaymentsFilters venues={[VENUE]} onSearch={onSearch} />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch.mock.calls[0]![0]).not.toHaveProperty('method');
  });
});
