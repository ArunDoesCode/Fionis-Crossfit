import { Suspense } from 'react';
import NavLinks, { NavLinksStatic } from '@/components/shells/NavLinks';
import SignOutButton from '@/components/shells/SignOutButton';
import { DEFAULT_GYM_NAME } from '@/lib/messages/words';

interface SideNavProps {
  /** Gym name from settings (E07). Until the setup stream passes it, the default name is shown. */
  gymName?: string;
}

// BR-REC-120: from 1024 px the same four places sit in a left side bar with the gym name and Sign out.
export default function SideNav({ gymName = DEFAULT_GYM_NAME }: SideNavProps) {
  return (
    <aside
      data-slot="side-nav"
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground lg:flex"
    >
      <p className="px-4 pt-2 text-lg font-semibold">{gymName}</p>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
        <Suspense fallback={<NavLinksStatic variant="side" />}>
          <NavLinks variant="side" />
        </Suspense>
      </nav>
      <SignOutButton />
    </aside>
  );
}
