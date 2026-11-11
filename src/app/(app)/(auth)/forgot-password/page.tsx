import { Heading, Text } from '@/components/ui/typography';
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <Heading level={1} variant="heading-lg" font="display">
          Reset your password
        </Heading>
        <Text size="sm" color="secondary">
          We&apos;ll email you a link to choose a new one.
        </Text>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
