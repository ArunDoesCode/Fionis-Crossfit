'use client';

import { useEffect, useState } from 'react';
import { readSidebarOpen, writeSidebarOpen } from '@/components/shells/sidebarState';
import { SidebarProvider, useSidebar } from '@/components/ui/sidebar';
import { useBackToClose } from '@/lib/hooks/useBackToClose';

// The phone drawer: Back closes it like any sheet (BR-REC-178), and it closes itself when the window
// grows past 768 px (the sidebar takes over).
function Drawer() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();
  useBackToClose(openMobile, () => setOpenMobile(false));
  useEffect(() => {
    if (!isMobile && openMobile) setOpenMobile(false);
  }, [isMobile, openMobile, setOpenMobile]);
  return null;
}

// Ctrl/Cmd+B is bold in a text field, so there it is left alone; anywhere else the sidebar's own
// shortcut is stopped before it sees the key (the header button is the way to collapse).
const blockShortcut = (event: KeyboardEvent) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest('input, textarea, [contenteditable]:not([contenteditable=false])')) return;
  if ((event.metaKey || event.ctrlKey) && event.key === 'b') event.stopPropagation();
};

export default function ShellProvider({ children }: { children: React.ReactNode }) {
  // The first paint already has the saved look (sidebarState.ts); React catches up right after hydration.
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(readSidebarOpen());
    window.addEventListener('keydown', blockShortcut, true);
    return () => window.removeEventListener('keydown', blockShortcut, true);
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        writeSidebarOpen(next);
      }}
      className="min-h-dvh"
    >
      <Drawer />
      {children}
    </SidebarProvider>
  );
}
