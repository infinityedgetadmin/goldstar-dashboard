'use client';
import type { ReactNode } from 'react';
import type { Operator, Role } from '@goldstar/platform';
import { operatorThemeVars } from '@/lib/operator-theme';
import { Sidebar, type NavItem } from './sidebar';
import { Topbar } from './topbar';

export type { NavItem };

export interface AppShellProps {
  nav: NavItem[];
  /** The current session's roles — gates each `nav` item's `roles` list. */
  roles: Role[];
  operator?: Operator;
  /**
   * Shell-specific control rendered in the topbar, left of the operator
   * switcher and user menu. The venue shell puts its venue switcher here;
   * the operator and platform shells pass nothing and render exactly as
   * before.
   */
  toolbar?: ReactNode;
  children: ReactNode;
}

/**
 * Filters a raw nav list down to what the current session may see: an
 * item with a `roles` list only shows when at least one of those roles
 * is held; an item with a `features` list only shows when the operator
 * has at least one of them enabled. A `platform_admin` role always
 * bypasses `roles` restrictions — while assuming an operator (spec §5),
 * their claims may or may not also carry an operator role, but they
 * should always see everything an owner/admin would (`features`
 * restrictions still apply, since those describe what the OPERATOR has
 * enabled, not who the viewer is). Exported standalone so it's directly
 * testable without mounting the full shell.
 */
export function visibleNavItems(nav: NavItem[], roles: Role[], operator: Operator | undefined): NavItem[] {
  const isPlatformAdmin = roles.includes('platform_admin');
  return nav.filter((item) => {
    if (item.roles && !isPlatformAdmin && !item.roles.some((r) => roles.includes(r))) return false;
    if (item.features && !item.features.some((f) => operator?.features?.[f])) return false;
    return true;
  });
}

/**
 * Shared authenticated-app frame: sidebar (desktop) / drawer (< lg),
 * topbar (assumed-operator banner, operator switcher, user menu), and a
 * scrollable content area. `(platform)/layout.tsx` and
 * `(operator)/layout.tsx` each pass their own `nav` + the current
 * session's `roles`/`operator`.
 */
export function AppShell({ nav, roles, operator, toolbar, children }: AppShellProps) {
  const gatedNav = visibleNavItems(nav, roles, operator);

  return (
    <div className="flex min-h-dvh bg-bg-secondary" style={operatorThemeVars(operator)}>
      <Sidebar nav={gatedNav} operator={operator} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar nav={gatedNav} operator={operator} toolbar={toolbar} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
