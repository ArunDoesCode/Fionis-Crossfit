import type { DueTab } from './types';

/** A row tap opens Record assessment for that member and assessment (BR-REC-102, C12; S10 is the assessments stream's). */
export const recordHref = (memberId: string, typeId: string) =>
  `/admin/members/${memberId}/assess?type=${typeId}` as const;

/** "Open member" in the row sheet (S7). */
export const memberHref = (memberId: string) => `/admin/members/${memberId}` as const;

/** "See all" and the S3 filter (BR-REC-101, 104): `/admin/due?tab=overdue|soon` and `&type=<assessment>`. */
export function dueListHref(tab: DueTab, typeId?: string | null) {
  return typeId
    ? (`/admin/due?tab=${tab}&type=${typeId}` as const)
    : (`/admin/due?tab=${tab}` as const);
}

/** The URL tab is "soon"; E31 asks "upcoming" (contract "Conventions"). */
export const tabToStatus = (tab: DueTab): 'overdue' | 'upcoming' =>
  tab === 'soon' ? 'upcoming' : 'overdue';
