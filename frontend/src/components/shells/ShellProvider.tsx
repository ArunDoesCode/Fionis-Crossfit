'use client';

import { useEffect, useState } from 'react';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { DESKTOP_QUERY } from '@/lib/hooks/useMediaQuery';

// Cookie that `ui/sidebar.tsx` writes on every toggle (BR-REC-177: the choice is remembered).
const SIDEBAR_COOKIE = 'sidebar_state';

/** The saved choice; with none (first visit) the sidebar starts collapsed to icons below 1024 px (Q5). */
function startsOpen(): boolean {
  const saved = document.cookie.match(new RegExp(`${SIDEBAR_COOKIE}=(true|false)`))?.[1];
  return saved ? saved === 'true' : window.matchMedia(DESKTOP_QUERY).matches;
}

// Phone drawer: Back closes it like any sheet (BR-REC-178).
function DrawerBackToClose() {
  const { openMobile, setOpenMobile } = useSidebar();
  useBackToClose(openMobile, () => setOpenMobile(false));
  return null;
}

export default function ShellProvider({ children }: { children: React.ReactNode }) {
  // The server cannot read the cookie without making the whole shell dynamic, so the first paint is
  // expanded and the saved choice is applied right after hydration.
  const [open, setOpen] = useState(true);
  useEffect(() => setOpen(startsOpen()), []);

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} className="min-h-dvh">
      <DrawerBackToClose />
      {children}
    </SidebarProvider>
  );
}
