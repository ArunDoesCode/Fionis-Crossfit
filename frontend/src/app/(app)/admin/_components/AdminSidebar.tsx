'use client';

import {
  Analytics01Icon,
  Home01Icon,
  Logout01Icon,
  Settings02Icon,
  UserMultiple02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense } from 'react';
import ThemeToggle from '@/components/common/ThemeToggle';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { useSignOut } from '@/lib/api/auth/queries';
import { afterHistorySettles } from '@/lib/assessments/leave';
import { DEFAULT_GYM_NAME, UI_TEXT } from '@/lib/messages/words';

interface NavItem {
  href: Route;
  label: string;
  icon: IconSvgElement;
  /** Routes under this prefix keep the item marked as current. */
  prefixes: readonly string[];
}

// BR-REC-177, 197: the one list behind the sidebar and the phone drawer.
// Due list and Memberships ending are reached from Home ("See all"), so they keep Home marked.
const NAV_ITEMS: readonly NavItem[] = [
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

function isActive(item: NavItem, pathname: string): boolean {
  // `/` is rewritten to Home (tactic 24), so the browser may report either path.
  if (pathname === item.href || (pathname === '/' && item.href === '/admin')) return true;
  return item.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const BUTTON =
  'h-[var(--control-height)] [&_svg]:size-5 group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:p-2.5!';

// BR-REC-227: the active item is an orange-tint pill (`bg-sidebar-accent`, from the shadcn button) with a 3 px
// orange bar at the left and orange 600 text; the icon is orange in NavMenu.
const ACTIVE =
  'relative data-active:font-semibold! data-active:before:absolute data-active:before:inset-y-2 data-active:before:left-0 data-active:before:w-[3px] data-active:before:rounded-r-sm data-active:before:bg-sidebar-primary';

// BR-REC-177, 227: gym name, the four places, then theme and Sign out in one row. Fixed to the window (dvh, not
// svh, so a phone's address bar does not cut Sign out off); only the page content scrolls. Below 768 px the
// same items are the ☰ drawer (its ☰ "Open menu" is in PageHeader, and the collapse toggle sits in the page
// header too, outside the sidebar). The header shows the orange "F" square, plus the name when expanded.
// The "pre-paint" CSS in lib/sidebarState.ts mirrors the `group-data-[collapsible=icon]` classes here.
export default function AdminSidebar({ gymName = DEFAULT_GYM_NAME }: { gymName?: string }) {
  const { mutate: signOut, isPending, isSuccess } = useSignOut();

  return (
    <Sidebar collapsible="icon" className="h-dvh">
      <SidebarHeader className="h-header flex-row items-center gap-2 px-4 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-2">
        <span
          aria-hidden="true"
          data-slot="sidebar-mark"
          className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary font-heading font-semibold text-primary-foreground"
        >
          F
        </span>
        <span
          data-slot="sidebar-wordmark"
          className="min-w-0 truncate font-heading text-lg font-semibold group-data-[collapsible=icon]:hidden"
        >
          {gymName}
        </span>
      </SidebarHeader>
      <SidebarContent className="px-2 group-data-[collapsible=icon]:px-0">
        <nav aria-label="Main">
          <Suspense fallback={<NavMenu pathname="" />}>
            <CurrentNavMenu />
          </Suspense>
        </nav>
      </SidebarContent>
      <SidebarFooter className="flex-row items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
        <ThemeToggle className="size-[var(--control-height)] shrink-0 group-data-[collapsible=icon]:size-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        {/* BR-REC-177, 35: ends this device's sign-in (E03). Off while the call runs, so a second tap cannot send it twice. */}
        <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
          <SidebarMenuItem>
            <SidebarMenuButton
              type="button"
              tooltip={UI_TEXT.signOut}
              className={BUTTON}
              disabled={isPending || isSuccess}
              onClick={() => signOut()}
            >
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              <span>{UI_TEXT.signOut}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// The one place that reads the current path. Active = `aria-current="page"`, an accent pill with an
// orange icon and a heavier weight, so it is never colour alone (BR-REC-125, 186). The Suspense fallback
// is the same links with nothing marked current, so the sidebar never changes size.
function CurrentNavMenu() {
  return <NavMenu pathname={usePathname()} />;
}

function NavMenu({ pathname }: { pathname: string }) {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();

  // In the drawer a link closes it first; the drawer's own history entry (useBackToClose) must be gone
  // before the page changes, or the new page would replace the wrong entry.
  const closeDrawerThenGo = (event: React.MouseEvent<HTMLAnchorElement>, href: Route) => {
    if (!isMobile || event.defaultPrevented) return;
    event.preventDefault();
    setOpenMobile(false);
    afterHistorySettles(() => router.push(href));
  };

  return (
    <SidebarMenu>
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              className={`${BUTTON} ${ACTIVE}`}
              render={
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => closeDrawerThenGo(event, item.href)}
                />
              }
            >
              <HugeiconsIcon
                icon={item.icon}
                strokeWidth={active ? 2.5 : 2}
                className={active ? 'text-sidebar-primary' : undefined}
              />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
