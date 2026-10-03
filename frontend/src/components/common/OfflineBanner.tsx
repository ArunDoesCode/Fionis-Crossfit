'use client';

import { WifiOff01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { UI_TEXT } from '@/lib/messages/words';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

// BR-REC-132: the browser fires `offline` at once when the connection drops (well inside 2 s) and
// `online` when it returns. The banner is thin and never hides anything; forms keep their values
// because nothing here touches them. The live region exists before the text so it is announced.
// The banner stays pinned to the top; while it shows, its measured height goes to `--offline-h` on
// <html> and the sticky PageHeader sits below it (`top-[var(--offline-h,0px)]`), so the back arrow
// and title are never covered.
export default function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  const bannerRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const banner = bannerRef.current;
    if (online || !banner) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--offline-h', `${banner.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(banner);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--offline-h');
    };
  }, [online]);

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-40 empty:hidden">
      {!online && (
        <p
          ref={bannerRef}
          className="flex min-h-9 items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-sm font-medium text-warning"
        >
          <HugeiconsIcon icon={WifiOff01Icon} strokeWidth={2} className="size-4 shrink-0" />
          {UI_TEXT.offline}
        </p>
      )}
    </div>
  );
}
