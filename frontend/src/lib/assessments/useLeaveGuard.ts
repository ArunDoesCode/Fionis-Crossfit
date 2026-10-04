'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { afterHistorySettles, canGoBackInApp } from './leave';

export interface LeaveGuard {
  /** The question "Leave without saving?" is showing. */
  open: boolean;
  /** [Stay]: the question closes and the guard is armed again. */
  stay: () => void;
  /** [Leave]: goes where the person was heading. The draft stays on the device. */
  leave: () => void;
  /** Go back to where the entry started (after a successful Save), without asking. */
  exitToStart: () => void;
}

/**
 * BR-REC-90, D19: while something is typed, leaving asks "Leave without saving?" for the close button (a
 * link to `closeHref`), any other link of the app, the browser's Back button, and (the browser's own prompt)
 * closing the tab. Back is caught with one extra history entry kept on top while `dirty`: Back takes that
 * entry off, the form's own entry is still current, and the question opens. [Stay] puts the entry back.
 * Leaving without a question ("back to where the entry started", D12) is `history back` when the page
 * before ours is the app's own, else `closeHref`.
 */
export function useLeaveGuard(dirty: boolean, closeHref: string): LeaveGuard {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dirtyRef = useRef(dirty);
  const guardOn = useRef(false); // our history entry is on top
  const selfPop = useRef(false); // the next "back" was made by us
  const exiting = useRef(false); // leaving for good: no more questions
  const onLeave = useRef<() => void>(() => {});

  const arm = useCallback(() => {
    if (guardOn.current) return;
    window.history.pushState({ ...window.history.state, leaveGuard: true }, '');
    guardOn.current = true;
  }, []);

  // Takes our entry off the history when it is on top, then runs `then`.
  const unarm = useCallback((then: () => void) => {
    if (!guardOn.current) {
      then();
      return;
    }
    guardOn.current = false;
    if (!window.history.state?.leaveGuard) {
      then();
      return;
    }
    selfPop.current = true;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      selfPop.current = false;
      window.removeEventListener('popstate', finish);
      clearTimeout(timer);
      then();
    };
    const timer = setTimeout(finish, 400); // safety net: never wait forever
    window.addEventListener('popstate', finish);
    window.history.back();
  }, []);

  const goToStart = useCallback(() => {
    if (canGoBackInApp()) router.back();
    else router.replace(closeHref as Route);
  }, [router, closeHref]);

  const exitToStart = useCallback(() => {
    exiting.current = true;
    afterHistorySettles(() => unarm(goToStart));
  }, [unarm, goToStart]);

  useEffect(() => {
    dirtyRef.current = dirty;
    if (dirty) arm();
    else if (guardOn.current) unarm(() => {});
  }, [dirty, arm, unarm]);

  useEffect(() => {
    const ask = (run: () => void) => {
      onLeave.current = run;
      setOpen(true);
    };

    // The browser's Back button took our entry off.
    const onPopState = () => {
      if (selfPop.current || exiting.current || !guardOn.current) return;
      if (window.history.state?.leaveGuard) return; // a sheet closing on top of our entry
      guardOn.current = false;
      ask(goToStart);
    };

    // The close button and every other link of the app.
    const onClick = (event: MouseEvent) => {
      if (exiting.current || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank') return;
      if (anchor.hasAttribute('download') || anchor.origin !== window.location.origin) return;
      const isClose = anchor.pathname === closeHref;
      if (!dirtyRef.current && !isClose) return;
      if (anchor.pathname === window.location.pathname && !isClose) return;
      event.preventDefault();
      event.stopPropagation();
      const run = isClose
        ? goToStart
        : () => router.push(`${anchor.pathname}${anchor.search}${anchor.hash}` as Route);
      if (dirtyRef.current) ask(run);
      else exitToStart();
    };

    // Closing or reloading the tab: the browser's own prompt (iPhones may skip it; the draft is kept anyway).
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || exiting.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [router, closeHref, goToStart, exitToStart]);

  const stay = useCallback(() => {
    setOpen(false);
    if (dirtyRef.current) arm();
  }, [arm]);

  const leave = useCallback(() => {
    setOpen(false);
    exiting.current = true;
    unarm(() => onLeave.current());
  }, [unarm]);

  return { open, stay, leave, exitToStart };
}
