'use client';

import { useSyncExternalStore } from 'react';
import { gymToday, type IsoDate } from '@/lib/domain/dates';

// One formatter for the device's own zone, built on first use (BR-REC-211: `gymToday` builds one per call and
// this runs on every render). Same fields and options as `gymToday` in lib/domain/dates.ts.
let deviceFormat: Intl.DateTimeFormat | undefined;
const format = (): Intl.DateTimeFormat =>
  (deviceFormat ??= new Intl.DateTimeFormat('en-US', {
    calendar: 'iso8601',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }));

/** The device's time zone (the gym and its phones are in one zone; the server stays authoritative). */
export const deviceTimeZone = (): string => format().resolvedOptions().timeZone;

/** Gym today = the device's calendar day (BR-REC-93, due-list.md). */
export const gymTodayNow = (): IsoDate => {
  const parts = format().formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

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
