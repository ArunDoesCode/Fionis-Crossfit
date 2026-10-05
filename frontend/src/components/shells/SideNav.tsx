import Image from 'next/image';
import { Suspense } from 'react';
import ThemeToggle from '@/components/common/ThemeToggle';
import NavLinks, { NavLinksStatic } from '@/components/shells/NavLinks';
import SignOutButton from '@/components/shells/SignOutButton';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar';
import { DEFAULT_GYM_NAME } from '@/lib/messages/words';

interface SideNavProps {
  /** Gym name from settings (E07). Until the setup stream passes it, the default name is shown. */
  gymName?: string;
}

// BR-REC-177: logo, the four places, theme and Sign out. Fixed to the window (dvh, not svh, so a phone's
// address bar does not cut Sign out off); only the page content scrolls. Below 768 px the same items
// are the ☰ drawer. Collapsed to icons the wordmark gives way to an orange "F" (BR-REC-186).
export default function SideNav({ gymName = DEFAULT_GYM_NAME }: SideNavProps) {
  return (
    <Sidebar collapsible="icon" className="h-dvh">
      <SidebarHeader className="h-(--header-height) justify-center px-4">
        <Image
          src="/Fionis-Logo.avif"
          alt={gymName}
          data-slot="sidebar-wordmark"
          width={284}
          height={106}
          className="h-auto w-28 group-data-[collapsible=icon]:hidden"
        />
        <span
          aria-hidden="true"
          data-slot="sidebar-mark"
          className="hidden size-8 items-center justify-center self-center rounded-lg bg-primary font-heading font-semibold text-primary-foreground group-data-[collapsible=icon]:flex"
        >
          F
        </span>
      </SidebarHeader>
      <SidebarContent className="px-2 group-data-[collapsible=icon]:px-0">
        <nav aria-label="Main">
          <Suspense fallback={<NavLinksStatic />}>
            <NavLinks />
          </Suspense>
        </nav>
      </SidebarContent>
      <SidebarFooter className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <ThemeToggle className="size-(--control-height) group-data-[collapsible=icon]:size-11 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  );
}
