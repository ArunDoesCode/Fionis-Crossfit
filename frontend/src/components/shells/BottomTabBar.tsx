import { Suspense } from 'react';
import NavLinks, { NavLinksStatic } from '@/components/shells/NavLinks';

// BR-REC-120: under 1024 px a bottom tab bar with Home, Members, Reports, Settings (icon + word),
// 8 px between the 44 px targets (BR-REC-122).
// It steps aside (globals.css: `[data-slot='bottom-tab-bar']` is hidden) while a sheet, a dialog or a
// form is open, and `--tabbar-h` drops to 0 so the action bar drops to the bottom edge.
export default function BottomTabBar() {
  return (
    <nav
      data-slot="bottom-tab-bar"
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] items-stretch gap-2 border-t bg-background px-2 pt-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {/* The current path is read on the client; the bar itself is static HTML. */}
      <Suspense fallback={<NavLinksStatic variant="tabs" />}>
        <NavLinks variant="tabs" />
      </Suspense>
    </nav>
  );
}
