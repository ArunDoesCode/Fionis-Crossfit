import {
  Analytics01Icon,
  Home01Icon,
  Settings02Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react';
import type { Route } from 'next';
import { UI_TEXT } from '@/lib/messages/words';

export interface NavItem {
  href: Route;
  label: string;
  icon: IconSvgElement;
  /** Routes under this prefix keep the item marked as current. */
  prefixes: readonly string[];
}

// BR-REC-177, 197: the one list behind the sidebar and the phone drawer.
// Due list and Memberships ending are reached from Home ("See all"), so they keep Home marked.
export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/admin',
    label: UI_TEXT.nav.home,
    icon: Home01Icon,
    prefixes: ['/admin/due', '/admin/memberships'],
  },
  {
    href: '/admin/members',
    label: UI_TEXT.nav.members,
    icon: UserMultiple02Icon,
    prefixes: ['/admin/members'],
  },
  {
    href: '/admin/reports',
    label: UI_TEXT.nav.reports,
    icon: Analytics01Icon,
    prefixes: ['/admin/reports'],
  },
  {
    href: '/admin/settings',
    label: UI_TEXT.nav.settings,
    icon: Settings02Icon,
    prefixes: ['/admin/settings'],
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  // `/` is rewritten to Home (tactic 24), so the browser may report either path.
  if (pathname === item.href || (pathname === '/' && item.href === '/admin')) return true;
  return item.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
