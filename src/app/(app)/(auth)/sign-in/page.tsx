import { Suspense } from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { SignInForm } from '@/features/auth/sign-in-form';
import { brand } from '@/config/operators/brand';

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <Heading level={1} variant="heading-lg" font="display">
          Sign in
        </Heading>
        <Text size="sm" color="secondary">
          {brand.displayName} operations
        </Text>
      </div>
      {/* SignInForm reads useSearchParams() (for ?next=) — Next.js requires a Suspense boundary above any such caller. */}
      <Suspense
        fallback={
          <Text size="sm" color="tertiary" className="text-center">
            Loading…
          </Text>
        }
      >
        <SignInForm />
      </Suspense>
    </div>
  );
}
