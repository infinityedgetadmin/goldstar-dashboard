'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { Toaster } from 'sonner';

/**
 * App-wide client providers. Deliberately NOT wrapping `{children}` with
 * `SessionProvider` (Task 2, disclosed in task-2-report.md): this
 * component is mounted from the ROOT `src/app/layout.tsx`, which every
 * route — including `(public)` — inherits. `SessionProvider` pulls in
 * `firebase/auth` + `firebase/firestore`'s full modular SDK, and
 * `scripts/check-guest-bundle.mjs` gates the `(public)` first-load JS
 * budget at 300 KB gzip (already ~283 KB per that script's own comment,
 * which explicitly anticipates this restructure). `SessionProvider` is
 * mounted per dashboard route group instead — see
 * `src/app/(auth)/layout.tsx`, `src/app/(platform)/layout.tsx`, and
 * `src/app/(operator)/layout.tsx` — keeping it out of the guest bundle
 * graph entirely rather than adding to it.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Task 2 mount point: session/auth provider goes here, wrapping children. */}
      {children}
      <Toaster
        position="bottom-right"
        richColors
        expand
        visibleToasts={5}
        toastOptions={{
          classNames: {
            toast: 'font-sans rounded-lg border border-border bg-bg-primary text-text-primary shadow-lg',
            title: 'text-body-sm font-medium',
            description: 'text-body-sm text-text-secondary',
            actionButton: 'bg-primary-500 text-white',
            cancelButton: 'bg-bg-secondary text-text-secondary',
            closeButton: 'border-border text-text-tertiary',
          },
        }}
      />
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
