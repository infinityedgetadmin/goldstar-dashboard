'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { brand } from '@/config/operators/brand';
import type { Operator, Role } from '@goldstar/platform';
import { cn } from '@/lib/utils';
import { Text } from '@/components/ui/typography';

export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Roles allowed to see this item. Omit to show it to any role the shell already restricts to. */
  roles?: Role[];
  /** Shown only if the operator has at least one of these `operator.features` keys enabled. */
  features?: (keyof Operator['features'])[];
  /**
   * Match `href` exactly instead of also matching its descendants. Needed
   * when one item's `href` is a PREFIX of a sibling's — the venue shell's
   * "Live board" (`/venue`) sits above `/venue/requests`, `/venue/reports`,
   * ... , so without this every venue sub-route would render TWO nav items
   * with `aria-current="page"`. Operator/platform nav hrefs are all
   * disjoint, so they leave this unset and keep prefix matching (which is
   * what `/tickets` -> `/tickets/[ticketId]` needs).
   */
  exact?: boolean;
}

export interface SidebarProps {
  nav: NavItem[];
  operator?: Operator;
  /** Rendered inside the mobile drawer (`Sheet`) instead of the fixed desktop rail — no `hidden lg:flex`, fills its container. */
  mobile?: boolean;
  /** Called when a nav link is activated — the mobile drawer uses this to close itself. */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ nav, operator, mobile = false, onNavigate, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'w-64 shrink-0 flex-col border-border bg-bg-primary',
        mobile ? 'flex h-full w-full' : 'hidden border-r lg:flex',
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 font-display text-heading-xs font-semibold text-white">
          {(operator?.branding.displayName ?? 'GV').slice(0, 2).toUpperCase()}
        </div>
        <Text size="sm" weight="semibold" className="truncate">
          {operator?.branding.displayName ?? brand.displayName}
        </Text>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Primary">
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-body-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
