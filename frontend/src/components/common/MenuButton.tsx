'use client';

import { Menu01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

// BR-REC-178, 227: on phones the top bar has ☰ "Open menu", which opens the drawer. From 768 px the
// sidebar toggle (SidebarTrigger in PageHeader) takes over.
export default function MenuButton({ className }: { className?: string }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Open menu"
      className={cn('size-[var(--control-height)] shrink-0', className)}
      onClick={() => setOpenMobile(true)}
    >
      <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} className="size-5" />
    </Button>
  );
}
