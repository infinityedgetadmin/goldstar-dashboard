'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { Button } from '@/components/ui/buttons';
import { Text } from '@/components/ui/typography';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { Operator } from '@goldstar/platform';
import { useOperator } from './use-operators';
import { SuspendOperatorDialog } from './suspend-operator-dialog';

const STATUS_TONE: Record<Operator['status'], StatusTone> = {
  onboarding: 'warning',
  active: 'positive',
  suspended: 'negative',
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-b-0">
      <Text size="sm" color="tertiary">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {value}
      </Text>
    </div>
  );
}

export interface OperatorDetailProps {
  operatorId: string;
}

export function OperatorDetail({ operatorId }: OperatorDetailProps) {
  const { data: operator, isLoading, isError } = useOperator(operatorId);
  const router = useRouter();
  const session = useSession();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [assuming, setAssuming] = useState(false);

  const handleAssume = async () => {
    setAssuming(true);
    try {
      await session.assumeOperator(operatorId);
      router.push('/home');
    } catch (e) {
      toast.error(e);
    } finally {
      setAssuming(false);
    }
  };

  if (isLoading) {
    return (
      <Text size="sm" color="tertiary">
        Loading operator…
      </Text>
    );
  }

  if (isError || !operator) {
    return <EmptyState title="Operator not found" description="This operator doesn't exist or couldn't be loaded." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={operator.name}
        description={`${operator.slug} · ${operator.plan}`}
        actions={
          <>
            <Button variant="secondary" icon={<ArrowRightLeft className="h-4 w-4" />} iconPosition="left" loading={assuming} onClick={handleAssume}>
              Assume
            </Button>
            <Button variant={operator.status === 'suspended' ? 'primary' : 'danger'} onClick={() => setSuspendOpen(true)}>
              {operator.status === 'suspended' ? 'Reactivate' : 'Suspend'}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Status" value={<StatusPill label={operator.status} tone={STATUS_TONE[operator.status]} />} />
            <DetailRow label="Plan" value={operator.plan} />
            <DetailRow label="Timezone" value={operator.timezone} />
            <DetailRow label="Currency" value={operator.currency} />
            <DetailRow label="Sandbox" value={operator.isSandbox ? 'Yes' : 'No'} />
            <DetailRow label="Created" value={formatDate(operator.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Display name" value={operator.branding.displayName} />
            <DetailRow
              label="Primary color"
              value={
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: operator.branding.primaryColor }} />
                  {operator.branding.primaryColor}
                </span>
              }
            />
            <DetailRow
              label="Accent color"
              value={
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: operator.branding.accentColor }} />
                  {operator.branding.accentColor}
                </span>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modules</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailRow label="Payments" value={operator.modules.payments.provider} />
            <DetailRow label="Messaging" value={operator.modules.messaging.provider} />
            <DetailRow label="Scheduling" value={operator.modules.scheduling.provider} />
            <DetailRow label="Vision" value={operator.modules.vision.provider} />
            <DetailRow label="Accounting" value={operator.modules.accounting.provider} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.entries(operator.features).map(([key, enabled]) => (
              <DetailRow key={key} label={key} value={enabled ? 'On' : 'Off'} />
            ))}
          </CardContent>
        </Card>
      </div>

      {/* No `onSuccess` needed — `useOperator()` is a live `onSnapshot` listener (see
          use-operators.ts's header comment), so the status change reflects here automatically. */}
      <SuspendOperatorDialog
        operatorId={operatorId}
        operatorName={operator.name}
        currentStatus={operator.status}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
      />
    </div>
  );
}
