import { parseAsStringLiteral } from 'nuqs/server';
import type { EndingStatus } from './types';

/** The tabs of S4 (BR-REC-53): "Ends soon" (default) and "Ended". */
export const ENDING_TABS = ['ending', 'ended'] as const;
export type EndingTab = (typeof ENDING_TABS)[number];

/** `?tab=` of `/admin/memberships`; the Home sections' "See all" links open the matching tab. */
export const endingTabParser = parseAsStringLiteral(ENDING_TABS).withDefault('ending');

export const isEndingTab = (value: unknown): value is EndingTab =>
  ENDING_TABS.some((tab) => tab === value);

/** One sentence when a list has nobody (BR-REC-130): no action. */
export const ENDING_EMPTY: Record<EndingStatus, string> = {
  expiring: "Nobody's membership is ending soon.",
  expired: 'No memberships ended in the last 30 days.',
};
