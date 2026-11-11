import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../proxy';

function req(pathname: string, { authed = false }: { authed?: boolean } = {}) {
  const headers = new Headers();
  if (authed) headers.set('cookie', 'gs_auth=1');
  return new NextRequest(new URL(pathname, 'https://dashboard.goldstarvalet.example.com'), { headers });
}

describe('proxy', () => {
  describe('protected dashboard routes', () => {
    const protectedPaths = [
      '/home',
      '/operators',
      '/operator/123',
      '/venues',
      // Plan 7 Task 1a: the venue portal's own routes (`src/app/(app)/(venue)`).
      '/venue',
      '/venue/requests',
      '/venue/validations',
      '/venue/reports',
      '/venue/invoices',
      '/venue/staffing',
      '/staff',
      '/shifts',
      '/tickets',
      '/live',
      '/dispatch',
      '/claims',
      '/incidents',
      '/payments',
      '/invoices',
      '/reports',
      '/integrations',
      '/branding',
      '/audit',
      '/settings',
      '/platform/plans',
      '/platform/audit',
    ];

    it.each(protectedPaths)('redirects %s to /sign-in?next=... when unauthenticated', (pathname) => {
      const res = proxy(req(pathname));
      expect(res.status).toBe(307);
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.pathname).toBe('/sign-in');
      expect(location.searchParams.get('next')).toBe(pathname);
    });

    it.each(protectedPaths)('passes %s through when the gs_auth cookie is present', (pathname) => {
      const res = proxy(req(pathname, { authed: true }));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('public routes', () => {
    const publicPaths = ['/', '/sign-in', '/forgot-password', '/accept-invite', '/no-access', '/t/abc123', '/pay/venue-token', '/payouts/return'];

    it.each(publicPaths)('never redirects %s when unauthenticated', (pathname) => {
      const res = proxy(req(pathname));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  it('redirects /sign-in to /home when already authenticated (F6, final-review.md)', () => {
    const res = proxy(req('/sign-in', { authed: true }));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get('location') ?? '');
    expect(location.pathname).toBe('/home');
  });

  it('does not redirect /sign-in when unauthenticated', () => {
    const res = proxy(req('/sign-in'));
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  describe('guest ticket/pay privacy headers (Plan 3, preserved)', () => {
    it('sets no-referrer and noindex headers on /t/* even when unauthenticated', () => {
      const res = proxy(req('/t/secret-token'));
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('sets no-referrer and noindex headers on /pay/*', () => {
      const res = proxy(req('/pay/venue-token'));
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it('sets the same headers on /payouts/* — the Stripe Connect return/refresh landing (Plan 8 Task 4)', () => {
      const res = proxy(req('/payouts/return?done=1'));
      expect(res.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(res.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    });

    it.each(['/t/secret-token', '/pay/venue-token', '/payouts/return'])(
      'Plan 8 Task 16: %s can never be framed (frame-ancestors none + X-Frame-Options DENY) and is nosniff',
      (pathname) => {
        const res = proxy(req(pathname));
        expect(res.headers.get('X-Frame-Options')).toBe('DENY');
        expect(res.headers.get('Content-Security-Policy')).toBe("frame-ancestors 'none'");
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      },
    );

    it('does not set guest privacy headers on unrelated public routes', () => {
      const res = proxy(req('/'));
      expect(res.headers.get('Referrer-Policy')).toBeNull();
      expect(res.headers.get('X-Robots-Tag')).toBeNull();
    });

    it('does not set guest privacy headers on protected dashboard routes', () => {
      const res = proxy(req('/tickets', { authed: true }));
      expect(res.headers.get('Referrer-Policy')).toBeNull();
      expect(res.headers.get('X-Robots-Tag')).toBeNull();
      expect(res.headers.get('X-Frame-Options')).toBeNull();
      expect(res.headers.get('Content-Security-Policy')).toBeNull();
    });
  });
});
