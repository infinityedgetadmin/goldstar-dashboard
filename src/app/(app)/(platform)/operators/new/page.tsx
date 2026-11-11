import { PageHeader } from '@/components/ui/page-header';
import { OnboardingWizard } from '@/features/platform/onboarding-wizard';

export const metadata = { title: 'New operator' };

export default function NewOperatorPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Onboard an operator" description="Set up a new valet operator on the platform." />
      <OnboardingWizard />
    </div>
  );
}
