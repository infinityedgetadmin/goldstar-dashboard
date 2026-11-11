import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useHashRoute } from '../use-hash-route';

function setHash(hash: string) {
  window.location.hash = hash;
}

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
});

describe('useHashRoute', () => {
  it('reads the initial hash on mount', () => {
    setHash('#drive-home');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBe('drive-home');
  });

  it('returns null for an unrecognized hash', () => {
    setHash('#something-else');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBeNull();
  });

  it('returns null when there is no hash', () => {
    setHash('');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBeNull();
  });

  it('updates on hashchange (e.g. a second button click, or back/forward)', () => {
    setHash('');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBeNull();

    act(() => {
      window.location.hash = 'ride';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.route).toBe('ride');

    act(() => {
      window.location.hash = 'drive-home';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.route).toBe('drive-home');
  });

  it('close() clears the hash via replaceState (no new history entry) and resets route to null', () => {
    setHash('#ride');
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.route).toBe('ride');

    const lengthBefore = window.history.length;
    act(() => result.current.close());

    expect(result.current.route).toBeNull();
    expect(window.location.hash).toBe('');
    expect(window.history.length).toBe(lengthBefore); // replaceState, not pushState
  });
});
