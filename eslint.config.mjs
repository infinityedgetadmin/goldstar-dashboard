import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// Next.js 16 removed `next lint`; `eslint-config-next` now ships its own
// flat-config exports (no `@eslint/eslintrc`/`FlatCompat` needed — that
// shim throws `Converting circular structure to JSON` against this
// version, confirmed against Next.js's own v16.1.1 docs, see
// task-1-report.md).
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Experimental React Compiler-adjacent rule, new in this version of
      // eslint-config-next. It flags the extremely common "sync local
      // state from a prop" effect pattern (used, unchanged, by both this
      // repo's own ui/forms/Combobox and the protected guest-requests
      // address-autocomplete — see task-1-report.md) as an error. Kept as
      // a warning rather than silenced outright: the underlying advice is
      // reasonable to revisit later, it just isn't a hard blocker today.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.firebase/**',
    'test-results/**',
    'playwright-report/**',
    'coverage/**',
  ]),
]);

export default eslintConfig;
