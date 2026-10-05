import type { MemberListItem, MembershipStatus } from './types';

export type MemberSearchField = 'name' | 'email' | 'phone';

/** BR-REC-202: matching starts at 2 characters. */
export const MIN_SEARCH_CHARS = 2;

/** Lower case, accents removed, spaces collapsed and trimmed ("  RENÉ   Dsouza " -> "rene dsouza"). */
export const foldText = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

interface SearchQuery {
  text: string;
  field: MemberSearchField;
  /** True = only archived members, false = only active ones. */
  archived: boolean;
  /** Only members whose membership has this status (the Active / Ends soon / Ended chips). */
  membership?: MembershipStatus;
}

/**
 * BR-REC-202: the members of the directory that match, in the order to show them. Text under 2 characters
 * returns the whole scope in the order given. Name: starts-with first, then the rest A-Z. Phone: digits only
 * (last 10 when more are typed). Email: part match, members without email never match. Never mutates `rows`.
 */
export function searchMembers(
  rows: MemberListItem[],
  { text, field, archived, membership }: SearchQuery,
) {
  const scope = rows.filter(
    (row) =>
      (row.archivedAt !== null) === archived &&
      (membership === undefined || row.membership.status === membership),
  );
  const folded = foldText(text);
  if (folded.length < MIN_SEARCH_CHARS) return scope;

  if (field === 'phone') {
    const digits = text.replace(/\D/g, '').slice(-10);
    if (digits === '') return [];
    return scope.filter((row) => row.phone.replace(/\D/g, '').includes(digits));
  }
  if (field === 'email') {
    return scope.filter((row) => row.email !== null && foldText(row.email).includes(folded));
  }
  const named = scope
    .map((row) => ({ row, name: foldText(row.fullName) }))
    .filter(({ name }) => name.includes(folded))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [
    ...named.filter(({ name }) => name.startsWith(folded)),
    ...named.filter(({ name }) => !name.startsWith(folded)),
  ].map(({ row }) => row);
}
