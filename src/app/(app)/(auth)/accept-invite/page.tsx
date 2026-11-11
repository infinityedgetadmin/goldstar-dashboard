import { Suspense } from 'react';
import { Heading, Text } from '@/components/ui/typography';
import { AcceptInviteForm } from '@/features/auth/accept-invite-form';
import { brand } from '@/config/operators/brand';

export default function AcceptInvitePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <Heading level={1} variant="heading-lg" font="display">
          Set up your account
        </Heading>
        <Text size="sm" color="secondary">
          Choose a password to finish joining {brand.displayName}.
        </Text>
      </div>
      {/* AcceptInviteForm reads useSearchParams() (for ?token=) — Next.js requires a Suspense boundary above any such caller. */}
      <Suspense
        fallback={
          <Text size="sm" color="tertiary" className="text-center">
            Loading…
          </Text>
        }
      >
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}
