import { useSyncExternalStore } from 'react';

export { DESKTOP_QUERY } from '@/lib/breakpoints';

/** Live `matchMedia`. The server snapshot is `false` (phone first), so nothing mismatches on hydration. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
