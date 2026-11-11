import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusTimeline } from '../status-timeline';

// Not part of the brief's given Step 1 test code (only ticket-view.test.tsx
// was specified there) — written for this task per the Files list, which
// also names `status-timeline.test.tsx` as a deliverable.

describe('StatusTimeline', () => {
  it('renders valet steps and marks Requested current for a requested ticket', () => {
    render(<StatusTimeline jobType="valet" status="requested" />);
    expect(screen.getByRole('list', { name: 'Status' })).toBeInTheDocument();
    for (const label of ['Parked', 'Requested', 'On its way', 'Ready', 'Delivered']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Requested').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Parked').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('marks Ready current (not Delivered) for a ready valet ticket', () => {
    render(<StatusTimeline jobType="valet" status="ready" />);
    expect(screen.getByText('Ready').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Delivered').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('marks Parked complete once a valet ticket has been requested', () => {
    render(<StatusTimeline jobType="valet" status="claimed" />);
    // "On its way" covers claimed/retrieving/staged; Parked and Requested precede it.
    expect(screen.getByText('On its way').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Parked').closest('li')).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Requested').closest('li')).not.toHaveAttribute('aria-current');
  });

  it('renders drive_home steps and marks Driving current for in_transit', () => {
    render(<StatusTimeline jobType="drive_home" status="in_transit" />);
    for (const label of ['Requested', 'Confirmed', 'On the way to you', 'Driving', 'Arrived']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Driving').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('renders passenger_ride steps and marks Driver on the way current for arrived_pickup', () => {
    render(<StatusTimeline jobType="passenger_ride" status="arrived_pickup" />);
    for (const label of ['Requested', 'Confirmed', 'Driver on the way', 'In transit', 'Arrived']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Driver on the way').closest('li')).toHaveAttribute('aria-current', 'step');
  });

  it('marks no step current for a cancelled ticket', () => {
    render(<StatusTimeline jobType="valet" status="cancelled" />);
    for (const label of ['Parked', 'Requested', 'On its way', 'Ready', 'Delivered']) {
      expect(screen.getByText(label).closest('li')).not.toHaveAttribute('aria-current');
    }
  });
});
