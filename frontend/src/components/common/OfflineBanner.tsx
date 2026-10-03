'use client';

import { WifiOff01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSyncExternalStore } from 'react';
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
export default function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );

  return (
    <div role="status" aria-live="polite" className="sticky top-0 z-40 empty:hidden">
      {!online && (
        <p className="flex min-h-9 items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-center text-sm font-medium text-warning">
          <HugeiconsIcon icon={WifiOff01Icon} strokeWidth={2} className="size-4 shrink-0" />
          {UI_TEXT.offline}
        </p>
      )}
    </div>
  );
}
