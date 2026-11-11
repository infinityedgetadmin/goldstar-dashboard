import { describe, expect, it, vi } from 'vitest';
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: (_f: unknown, name: string) => async (d: unknown) => ({ data: name === 'guestRequestVehicle' ? { status: 'requested' } : d }), connectFunctionsEmulator: vi.fn() }));
vi.mock('../firebase', () => ({ publicFirebase: () => ({ functions: {} }) }));
import { guestCall } from '../callables';
describe('guestCall', () => {
  it('validates input/output with platform schemas', async () => {
    expect(await guestCall('guestRequestVehicle')({ token: 'AbCdEfGhIjKlMnOpQrStUv' })).toEqual({ status: 'requested' });
    await expect(guestCall('guestRequestVehicle')({ token: 'bad' } as never)).rejects.toThrow();
  });
});
