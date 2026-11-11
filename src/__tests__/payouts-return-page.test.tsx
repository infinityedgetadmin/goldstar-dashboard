import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Page, { PAYOUT_RETURN_COPY, classifyReturn, metadata } from '../app/(public)/payouts/return/page';

describe('classifyReturn', () => {
  it('done=1 is the Account Link return_url landing', () => {
    expect(classifyReturn({ done: '1' })).toBe('done');
  });
  it('refresh=1 is the refresh_url landing (expired / revisited single-use link)', () => {
    expect(classifyReturn({ refresh: '1' })).toBe('refresh');
  });
  it('done wins when both are present; anything else (no params, other values, arrays) is unknown', () => {
    expect(classifyReturn({ done: '1', refresh: '1' })).toBe('done');
    expect(classifyReturn({})).toBe('unknown');
    expect(classifyReturn({ done: 'yes' })).toBe('unknown');
    expect(classifyReturn({ done: ['1'] })).toBe('unknown');
  });
});

describe('/payouts/return page', () => {
  it.each(['done', 'refresh', 'unknown'] as const)('renders the %s copy', async (state) => {
    const params = state === 'done' ? { done: '1' } : state === 'refresh' ? { refresh: '1' } : {};
    render(await Page({ searchParams: Promise.resolve(params) }));
    expect(screen.getByRole('heading', { level: 1, name: PAYOUT_RETURN_COPY[state].title })).toBeTruthy();
    expect(screen.getByText(PAYOUT_RETURN_COPY[state].body)).toBeTruthy();
  });

  it('is never indexed — the landing is reached only from Stripe redirects', () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
