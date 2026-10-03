import { useEffect } from 'react';

// BR-REC-138: "Back closes" a sheet or dialog. While it is open we keep one extra history entry, so the
// phone's Back button (or browser Back) pops that entry and closes the sheet instead of leaving the page.
// If the sheet is closed another way (button, swipe, outside tap) the entry is removed again.
// The push is deferred one tick so React Strict Mode's mount/unmount/mount in development does not
// leave a stray entry behind.
export function useBackToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    let pushed = false;
    let closedByBack = false;

    const timer = setTimeout(() => {
      window.history.pushState({ ...window.history.state, sheet: true }, '');
      pushed = true;
    }, 0);

    const onPopState = () => {
      // Landed on another sheet entry (stale traversal): not ours to close.
      if (window.history.state?.sheet) return;
      closedByBack = true;
      close();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', onPopState);
      if (pushed && !closedByBack && window.history.state?.sheet) window.history.back();
    };
  }, [open, close]);
}
