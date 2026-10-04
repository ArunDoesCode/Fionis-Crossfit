import { parseAsString, parseAsStringLiteral } from 'nuqs/server';
import type { MemberStatusFilter } from './types';

/** The chips of S5 (BR-REC-57): All is the default list (everyone not archived, any membership status). */
export const MEMBER_FILTERS = ['all', 'active', 'expiring', 'expired', 'archived'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/** `?q=` and `?status=` of `/admin/members` (kept in the URL so Back returns to the same list). */
export const memberListParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(MEMBER_FILTERS).withDefault('all'),
};

/** The chip → E16 `status` (All sends none). */
export const filterToStatus = (filter: MemberFilter): MemberStatusFilter | undefined =>
  filter === 'all' ? undefined : filter;
