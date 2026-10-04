// Browser history helpers for leaving the form (D12, D19). No React.

/** True when the page before this one belongs to the app (so "back" stays in it). */
export function canGoBackInApp(): boolean {
  // The Navigation API only lists entries of this app; browsers without it fall back to the history length.
  const navigation = (window as { navigation?: { canGoBack?: unknown } }).navigation;
  if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack;
  return window.history.length > 1;
}

/**
 * A sheet keeps one extra history entry while it is open and removes it when it closes (`useBackToClose`).
 * Navigating before that has happened would replace the wrong entry, so wait for it: `run` is called
 * straight away when no sheet entry is on top, else after the sheet's own "back" has landed.
 */
export function afterHistorySettles(run: () => void): void {
  if (!window.history.state?.sheet) {
    run();
    return;
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', finish);
    clearTimeout(timer);
    run();
  };
  const timer = setTimeout(finish, 400); // safety net: never wait forever
  window.addEventListener('popstate', finish);
}
