import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinkedJobsSwitcher } from '../linked-jobs-switcher';

const jobs = [
  { jobType: 'drive_home' as const, status: 'en_route_to_guest' as const, token: 'TokenAAAAAAAAAAAAAAAA', ticketId: 'job1' },
  { jobType: 'passenger_ride' as const, status: 'completed' as const, token: 'TokenBBBBBBBBBBBBBBBB', ticketId: 'job2' },
];

describe('LinkedJobsSwitcher', () => {
  it('renders nothing when there are no linked jobs', () => {
    const { container } = render(<LinkedJobsSwitcher jobs={[]} selectedToken={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one tab per linked job, labeled by job type and a humanized status', () => {
    render(<LinkedJobsSwitcher jobs={jobs} selectedToken={null} onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Drive home · En Route To Guest' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Ride · Completed' })).toBeInTheDocument();
  });

  it('marks the selected token as the active tab', () => {
    render(<LinkedJobsSwitcher jobs={jobs} selectedToken="TokenBBBBBBBBBBBBBBBB" onSelect={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Ride · Completed' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Drive home · En Route To Guest' })).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onSelect with the job token when a tab is clicked', () => {
    const onSelect = vi.fn();
    render(<LinkedJobsSwitcher jobs={jobs} selectedToken={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Drive home · En Route To Guest' }));
    expect(onSelect).toHaveBeenCalledWith('TokenAAAAAAAAAAAAAAAA');
  });
});
