'use client';
import { useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import type { Operator } from '@goldstar/platform';
import { useSession } from '@/features/auth/use-session';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/lib/toast';
import { Sidebar, type NavItem } from './sidebar';
import { UserMenu } from './user-menu';
import { OperatorSwitcher } from './operator-switcher';

export interface TopbarProps {
  nav: NavItem[];
  operator?: Operator;
  /** See `AppShellProps['toolbar']` — shell-specific control, rendered left of the switcher/menu. */
  toolbar?: ReactNode;
}

export function Topbar({ nav, operator, toolbar }: TopbarProps) {
  const session = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const assumedOperatorId = session.assumedOperatorId;

  const handleLeaveAssumed = async () => {
    try {
      await session.leaveAssumed();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      {assumedOperatorId && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-accent-100 px-4 py-2 text-ui-sm text-accent-900">
          <span>
            Viewing as <strong>{operator?.branding.displayName ?? assumedOperatorId}</strong> — you&apos;re a platform
            admin acting on this operator&apos;s behalf.
          </span>
          <button
            type="button"
            onClick={handleLeaveAssumed}
            className="min-h-11 shrink-0 rounded-md px-3 font-medium underline underline-offset-2"
          >
            Leave
          </button>
        </div>
      )}
      <header className="flex h-16 items-center gap-3 border-b border-border bg-bg-primary px-4">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-bg-secondary lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex-1" />
        {toolbar}
        <OperatorSwitcher />
        <UserMenu />
      </header>
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Sidebar nav={nav} operator={operator} mobile onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
