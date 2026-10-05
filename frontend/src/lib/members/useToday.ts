'use client';

import { useSyncExternalStore } from 'react';
import { gymToday, type IsoDate } from '@/lib/domain/dates';

/** The device's time zone (the gym and its phones are in one zone; the server stays authoritative). */
const DateTimeFormat = Intl.DateTimeFormat;
let cachedZone: string | undefined;
export const deviceTimeZone = (): string => {
  cachedZone ??= DateTimeFormat().resolvedOptions().timeZone; // looked up once (BR-REC-211)
  return cachedZone;
};

/** Gym today = the device's calendar day (BR-REC-93, due-list.md). */
export const gymTodayNow = (): IsoDate => gymToday(new Date(), deviceTimeZone());

const MINUTE = 60_000;

// A string is compared by value, so React only re-renders when the day really changes (midnight).
const subscribe = (onChange: () => void) => {
  const timer = setInterval(onChange, MINUTE);
  return () => clearInterval(timer);
};

// The server snapshot only has to be a valid day; the browser's own day replaces it after hydration.
const serverSnapshot = (): IsoDate => gymToday(new Date(), 'UTC');

/** Today as `YYYY-MM-DD`, kept current across midnight while a screen stays open. */
export function useToday(): IsoDate {
  return useSyncExternalStore(subscribe, gymTodayNow, serverSnapshot);
}

const subscribeNever = () => () => {};

/** False while the page is hydrating, true in the browser after: for screens that must not paint a server guess. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
}
