'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal } from 'lucide-react';
import { useSession } from '@/features/auth/use-session';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/buttons';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui/typography';
import { formatDate } from '@/lib/format';
import { toast } from '@/lib/toast';
import { useOperators, type OperatorRow } from './use-operators';
import { SuspendOperatorDialog } from './suspend-operator-dialog';

const STATUS_TONE: Record<OperatorRow['status'], StatusTone> = {
  onboarding: 'warning',
  active: 'positive',
  suspended: 'negative',
};

function OperatorRowActions({ operator }: { operator: OperatorRow }) {
  const router = useRouter();
  const session = useSession();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [assuming, setAssuming] = useState(false);

  const handleAssume = async () => {
    setAssuming(true);
    try {
      await session.assumeOperator(operator.id);
      router.push('/home');
    } catch (e) {
      toast.error(e);
    } finally {
      setAssuming(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" aria-label={`Actions for ${operator.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/operators/${operator.id}`)}>Open</DropdownMenuItem>
          <DropdownMenuItem disabled={assuming} onClick={handleAssume}>
            Assume
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSuspendOpen(true)}>
            {operator.status === 'suspended' ? 'Reactivate' : 'Suspend'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* No `onSuccess` needed — `useOperators()` is a live `onSnapshot` listener (see
          use-operators.ts's header comment), so the status change lands in this row automatically. */}
      <SuspendOperatorDialog
        operatorId={operator.id}
        operatorName={operator.name}
        currentStatus={operator.status}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
      />
    </>
  );
}

const columns: ColumnDef<OperatorRow>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link href={`/operators/${row.original.id}`} className="text-body-sm font-medium text-text-primary hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  { accessorKey: 'slug', header: 'Slug' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <StatusPill label={row.original.status} tone={STATUS_TONE[row.original.status]} />,
  },
  { accessorKey: 'plan', header: 'Plan' },
  {
    accessorKey: 'venueCount',
    header: 'Venues',
    cell: ({ row }) => <Text size="sm">{row.original.venueCount}</Text>,
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => <Text size="sm">{formatDate(row.original.createdAt)}</Text>,
  },
  {
    id: 'actions',
    header: '',
    enableHiding: false,
    cell: ({ row }) => <OperatorRowActions operator={row.original} />,
  },
];

export function OperatorsTable() {
  const { data, isLoading, isError } = useOperators();

  if (isLoading) {
    return (
      <Text size="sm" color="tertiary">
        Loading operators…
      </Text>
    );
  }

  if (isError) {
    return (
      <EmptyState title="Couldn't load operators" description="Something went wrong. Please try again." />
    );
  }

  if (!data || data.length === 0) {
    return <EmptyState title="No operators yet" description="Onboard your first operator to get started." />;
  }

  return <DataTable columns={columns} data={data} searchPlaceholder="Filter operators..." />;
}
