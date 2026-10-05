import { parseAsString, parseAsStringLiteral } from 'nuqs/server';

/** The chips of S5 (BR-REC-57): All is the default list (everyone not archived, any membership status). */
export const MEMBER_FILTERS = ['all', 'active', 'expiring', 'expired', 'archived'] as const;
export type MemberFilter = (typeof MEMBER_FILTERS)[number];

/** `?q=`, `?by=` and `?status=` of `/admin/members` (kept in the URL so Back returns to the same list). */
export const memberListParams = {
  q: parseAsString.withDefault('').withOptions({ history: 'replace' }),
  by: parseAsStringLiteral(['name', 'email', 'phone'] as const)
    .withDefault('name')
    .withOptions({ history: 'replace' }),
  status: parseAsStringLiteral(MEMBER_FILTERS).withDefault('all'),
};
