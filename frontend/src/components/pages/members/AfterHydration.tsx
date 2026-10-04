'use client';

import { useIsClient } from '@/lib/members/useToday';

interface AfterHydrationProps {
  /** Grey shapes of the real layout, shown until the browser has taken over. */
  fallback: React.ReactNode;
  children: React.ReactNode;
}

// "Today" is the device's day, which the server cannot know. A form that starts with "Joined on = today"
// must not take its default from the server's guess, so it is drawn only in the browser (the server and the
// first browser paint show the fallback). Same grey shapes as the route's loading.tsx (BR-REC-129).
export default function AfterHydration({ fallback, children }: AfterHydrationProps) {
  return useIsClient() ? children : fallback;
}
