import { callables, type CallableName } from '@goldstar/platform';

/**
 * Contract-checked callable mock (T1b fix round, MINOR-2 — the reviewer's shape, taken):
 * component tests mock `@/lib/firebase/callables`, but the real wrapper's first act is
 * `callables[name].input.parse(input)` — so a bare `vi.fn()` mock silently exempts every test
 * payload from the installed contract. This factory keeps the boundary honest by construction:
 * the REAL zod input schema parses the REAL payload the component built before the test's mock
 * sees it, and the mock's resolved value is parsed against the REAL output schema on the way
 * back (so response fixtures can't drift either). A payload or fixture that violates the
 * installed contract now fails the component's own test — no hand-maintained literal suite
 * required.
 *
 * Usage (the factory runs inside a hoisted `vi.mock`, so it's imported dynamically there):
 *
 *   const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
 *   vi.mock('@/lib/firebase/callables', async () => {
 *     const { contractCheckedCallable } = await import('./contract-checked-callable');
 *     return { callable: contractCheckedCallable(requestMock) };
 *   });
 *
 * Not a test file — vitest only collects `*.test.*`.
 */
export function contractCheckedCallable(mock: (input: unknown) => unknown) {
  return (name: CallableName) => async (input: unknown) => {
    const parsed = callables[name].input.parse(input);
    const out = await mock(parsed);
    return callables[name].output.parse(out);
  };
}
