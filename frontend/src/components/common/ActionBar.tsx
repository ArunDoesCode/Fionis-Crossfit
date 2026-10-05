'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Id of the empty element at the end of the admin content area (admin layout) where the bar is drawn. */
export const ACTION_BAR_SLOT = 'action-bar-slot';

// BR-REC-180, 234: on a phone a form's one main action (Save) is a full-width bar fixed to the bottom edge.
// It is drawn into a slot after the page content, so in tab order it comes after the fields (a keyboard or
// screen reader user reaches Save last). Hidden from 768 px, where the action sits in the page header.
export default function ActionBar({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(ACTION_BAR_SLOT)), []);
  if (!slot) return null;
  return createPortal(
    <div
      data-slot="action-bar"
      className="fixed inset-x-0 bottom-0 z-30 flex min-h-actionbar items-center border-t bg-background px-4 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="flex w-full flex-col *:h-[var(--control-height)] *:w-full">{children}</div>
    </div>,
    slot,
  );
}
