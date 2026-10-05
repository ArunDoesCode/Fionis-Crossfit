'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(min-width: 1024px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
};

/** BR-REC-183: true from 1024 px (Tailwind `lg`): lists show a table there, rows below. False while hydrating. */
export const useDesktop = (): boolean =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
