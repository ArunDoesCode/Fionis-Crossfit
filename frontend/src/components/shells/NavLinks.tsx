'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { isNavItemActive, NAV_ITEMS } from '@/components/shells/navItems';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { afterHistorySettles } from '@/lib/assessments/leave';

// The one place that reads the current path. Active = `aria-current="page"`, an orange-tint pill with
// orange icon and word and a heavier weight, so it is never colour alone (BR-REC-125, 186).
export default function NavLinks() {
  return <NavMenu pathname={usePathname()} />;
}

/** Same links with nothing marked current: the Suspense fallback, so the sidebar never changes size. */
export function NavLinksStatic() {
  return <NavMenu pathname="" />;
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
        const active = isNavItemActive(item, pathname);
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              className="h-(--control-height) [&_svg]:size-5 data-active:bg-brand/15 data-active:text-brand"
              render={
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => closeDrawerThenGo(event, item.href)}
                />
              }
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={active ? 2.5 : 2} />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
