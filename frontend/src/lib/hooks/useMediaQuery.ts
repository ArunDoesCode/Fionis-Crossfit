import { useSyncExternalStore } from 'react';

/** The side bar and centred dialogs start here (BR-REC-120, 138); below it the phone layout applies. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

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
