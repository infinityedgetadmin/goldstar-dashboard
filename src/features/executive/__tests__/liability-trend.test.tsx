import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiabilityTrend } from '../liability-trend';

describe('LiabilityTrend', () => {
  it('renders the title and empty state with no data', () => {
    render(<LiabilityTrend days={[]} />);
    expect(screen.getByText('Liability trend')).toBeInTheDocument();
    expect(screen.getByText('No data for this range')).toBeInTheDocument();
  });
});
