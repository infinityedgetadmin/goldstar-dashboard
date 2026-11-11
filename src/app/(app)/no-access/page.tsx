import Link from 'next/link';
import { Heading, Text } from '@/components/ui/typography';
import { Button } from '@/components/ui/buttons';

export const metadata = { title: 'No access', robots: { index: false, follow: false } };

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg-secondary px-6 text-center">
      <Heading level={1} variant="heading-lg" font="display">
        You don&apos;t have access to this page
      </Heading>
      <Text size="md" color="secondary" className="max-w-md">
        Your account doesn&apos;t have permission to view this. If you think this is a mistake, contact your operator
        admin.
      </Text>
      <Link href="/sign-in">
        <Button variant="secondary">Back to sign in</Button>
      </Link>
    </main>
  );
}
