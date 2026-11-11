import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HealthBadge } from '../health-badge';

describe('HealthBadge', () => {
  it('renders "Not tested" when there is no doc at all', () => {
    render(<HealthBadge />);
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('renders "Not tested" when the doc exists but has no health field yet', () => {
    render(<HealthBadge doc={{ status: 'configured' }} />);
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('renders "Healthy" for an ok health result', () => {
    render(<HealthBadge doc={{ health: { ok: true } }} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('renders "Error" for a non-ok health result', () => {
    render(<HealthBadge doc={{ health: { ok: false, message: 'health check not implemented for this provider yet' } }} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('surfaces the health message via the title attribute for an error', () => {
    render(<HealthBadge doc={{ health: { ok: false, message: 'boom' } }} />);
    expect(screen.getByText('Error')).toHaveAttribute('title', 'boom');
  });

  it('falls back to lastError for the title when health has no message', () => {
    render(<HealthBadge doc={{ health: { ok: false }, lastError: 'connection refused' }} />);
    expect(screen.getByText('Error')).toHaveAttribute('title', 'connection refused');
  });
});

describe('HealthBadge: the third state (Ruling AC)', () => {
  it('renders "Not configured" in a NEUTRAL tone — a missing integration is not a failure', () => {
    render(<HealthBadge configured={false} />);
    const pill = screen.getByText('Not configured');
    expect(pill).toBeInTheDocument();
    expect(pill.className).not.toMatch(/error/);
  });

  it('says why, so "Not configured" does not read as a bug someone should chase', () => {
    render(<HealthBadge configured={false} />);
    expect(screen.getByText('Not configured')).toHaveAttribute('title', expect.stringContaining('not a failure'));
  });

  it('OVERRIDES a red health stamp: an unconfigured venue is never reported as an error', () => {
    // Any doc stamped by the old "Test connection" carries `health.ok:false` +
    // `lastError: 'health check not implemented for this provider yet'`. Those documents exist, and
    // rendering them red for a venue that was never set up is exactly the meaningless red AC forbids.
    render(<HealthBadge configured={false} doc={{ health: { ok: false, message: 'health check not implemented for this provider yet' } }} />);
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });

  it('does not suppress a REAL error for a venue that IS configured', () => {
    render(<HealthBadge configured doc={{ health: { ok: false, message: 'auth failed' } }} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });

  it('a configured venue with no health yet is "Not tested", not "Not configured"', () => {
    render(<HealthBadge configured doc={{ status: 'configured' }} />);
    expect(screen.getByText('Not tested')).toBeInTheDocument();
  });

  it('operator-scoped callers pass no `configured` at all and are completely unaffected', () => {
    render(<HealthBadge doc={{ health: { ok: true } }} />);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.queryByText('Not configured')).not.toBeInTheDocument();
  });
});
