'use client';

import { useState } from 'react';

/**
 * True from the first time `open` is true, and stays true. A sheet that is loaded on demand is mounted on
 * the first tap and then kept mounted, so it can play its exit animation and keep its content while closing.
 * It answers `true` in the same render that `open` turns true (no extra pass).
 */
export function useEverOpened(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);
  return everOpened || open;
}
