import { useEffect, useRef } from 'react';

// BR-REC-138: "Back closes" a sheet or dialog. While it is open we keep one extra history entry, so the
// phone's Back button (or browser Back) pops that entry and closes the sheet instead of leaving the page.
// If the sheet is closed another way (button, swipe, outside tap) the entry is removed again.
// The push is deferred one tick so React Strict Mode's mount/unmount/mount in development does not
// leave a stray entry behind. `close` lives in a ref and the effect depends on `open` only, so a new
// `close` function on every render cannot tear the effect down (that would call history.back()).
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (!open) return;
    let pushed = false;
    let closedByBack = false;

    const timer = setTimeout(() => {
      // `leaveGuard` is cleared: the entry under a sheet belongs to the form's guard, not to this one.
      window.history.pushState({ ...window.history.state, sheet: true, leaveGuard: false }, '');
      pushed = true;
    }, 0);

    const onPopState = () => {
      // Landed on another sheet entry (stale traversal): not ours to close.
      if (window.history.state?.sheet) return;
      closedByBack = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('popstate', onPopState);
      if (pushed && !closedByBack && window.history.state?.sheet) window.history.back();
    };
  }, [open]);
}
