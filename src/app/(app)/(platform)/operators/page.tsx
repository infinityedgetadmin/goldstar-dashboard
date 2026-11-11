import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/buttons';
import { OperatorsTable } from '@/features/platform/operators-table';

export const metadata = { title: 'Operators' };

export default function OperatorsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Operators"
        description="Every valet operator on the platform."
        actions={
          <Link href="/operators/new">
            <Button icon={<Plus className="h-4 w-4" />} iconPosition="left">
              New operator
            </Button>
          </Link>
        }
      />
      <OperatorsTable />
    </div>
  );
}
