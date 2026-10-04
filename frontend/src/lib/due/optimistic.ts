import type { DueChange, DueListItem, MemberDueItem } from './types';

// What the cached lists look like right after Assess soon, Remind me later or remove (perf tactic 8, C13),
// before the server has answered. Pure: nothing here reads a clock or changes its input. The server stays
// the truth; the lists are read again when the call ends.

const isSameRow = (row: { memberId: string; typeId: string }, change: DueChange): boolean =>
  row.memberId === change.memberId && row.typeId === change.typeId;

// Plain `<` and `>` compare code units, like the server (E16, E31 order; C5), not a locale.
const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The order of every due list (BR-REC-97, C5): Assess soon first, then the earliest due date (= most days
 * overdue, then soonest due), then the name A-Z ignoring case. Rows that tie keep the order they came in.
 * Returns a new list.
 */
export function sortDueRows(rows: readonly DueListItem[]): DueListItem[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.flagged) - Number(a.flagged) ||
      compareText(a.dueOn, b.dueOn) ||
      compareText(a.fullName.toLowerCase(), b.fullName.toLowerCase()),
  );
}

/**
 * One E31 list (`tab` = the list's own `status`) after `change`. A row is matched by member + assessment.
 * - Remind me later: the row is hidden from both lists.
 * - Assess soon: in Overdue the row is flagged and joins the Assess soon rows at the top (C5 order); in Due soon
 *   an Assess soon row never is, so it leaves.
 * - Remove: in Overdue a flagged row loses the flag and takes its place by date (a row that was listed only
 *   because of the flag stays until the lists are read again); nothing to remove in Due soon.
 * No matching row (or nothing to change): the same list is returned.
 */
export function applyDueChange(
  list: DueListItem[],
  change: DueChange,
  tab: 'overdue' | 'upcoming',
): DueListItem[] {
  const row = list.find((candidate) => isSameRow(candidate, change));
  if (!row) return list;

  if (change.action === 'snooze') return list.filter((candidate) => candidate !== row);

  if (change.action === 'flag') {
    if (tab === 'upcoming') return list.filter((candidate) => candidate !== row);
    return sortDueRows(
      list.map((candidate) => (candidate === row ? { ...candidate, flagged: true } : candidate)),
    );
  }

  // remove
  if (tab === 'upcoming' || !row.flagged) return list;
  return sortDueRows(
    list.map((candidate) => (candidate === row ? { ...candidate, flagged: false } : candidate)),
  );
}

/**
 * The member page lines after `change` (BR-REC-100, 103): Assess soon and a reminder replace each other,
 * remove clears both. Only the line of that assessment changes; dates, state and chips stay (the next read
 * brings the server's). `memberId` is not compared: the list is already that member's.
 */
export function applyMemberDueChange(items: MemberDueItem[], change: DueChange): MemberDueItem[] {
  return items.map((line) => {
    if (line.typeId !== change.typeId) return line;
    if (change.action === 'flag') return { ...line, flagged: true, snoozedUntil: null };
    if (change.action === 'snooze') {
      return { ...line, flagged: false, snoozedUntil: change.until ?? null };
    }
    return { ...line, flagged: false, snoozedUntil: null };
  });
}
