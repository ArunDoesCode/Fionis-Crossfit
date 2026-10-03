'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isNavItemActive, NAV_ITEMS } from '@/components/shells/navItems';
import { cn } from '@/lib/utils';

interface NavLinksProps {
  /** `tabs` = phone bottom bar (icon over word); `side` = desktop side bar (icon beside word). */
  variant: 'tabs' | 'side';
}

// The one place that reads the current path. Active = `aria-current="page"`, a filled pill and a
// heavier word, so it is never colour alone (BR-REC-125). Tabs prefetch by default (tactic 6).
export default function NavLinks({ variant }: NavLinksProps) {
  return <NavLinksFor variant={variant} pathname={usePathname()} />;
}

/** Same links with nothing marked current: the Suspense fallback, so the bar never changes size. */
export function NavLinksStatic({ variant }: NavLinksProps) {
  return <NavLinksFor variant={variant} pathname="" />;
}

function NavLinksFor({ variant, pathname }: NavLinksProps & { pathname: string }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              variant === 'tabs'
                ? 'min-h-tap min-w-tap flex-1 flex-col justify-center gap-0.5 rounded-xl text-xs'
                : 'h-12 gap-3 rounded-full px-4 text-base',
              active
                ? 'font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground',
              variant === 'side' && active && 'bg-sidebar-accent text-sidebar-accent-foreground',
              variant === 'side' && !active && 'hover:bg-sidebar-accent/60',
            )}
          >
            <span
              className={cn(
                'flex items-center justify-center',
                variant === 'tabs' && 'h-8 w-14 rounded-full',
                variant === 'tabs' && active && 'bg-secondary',
              )}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={active ? 2.5 : 2} className="size-6" />
            </span>
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
