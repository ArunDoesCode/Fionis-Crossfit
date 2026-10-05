import { gymToday, type IsoDate } from '@/lib/domain/dates';
import { formatDay, formatPhone } from '@/lib/format';
import type { MemberListItem } from './types';

/**
 * The one detail line under a member's name in a list (BR-REC-135, S5):
 * "98450 12345 · Last 12 Sep" / "98450 12345 · Never assessed", and for an archived member
 * "Archived 2 Jun · Ended 31 May" ("Ends 31 Dec" while the membership still runs).
 * `archivedAt` (ISO UTC) is shown as a day in `timeZone`.
 */
export const memberListDetail = (
  item: Pick<MemberListItem, 'phone' | 'lastAssessedOn' | 'archivedAt' | 'membership'>,
  _today: IsoDate,
  timeZone: string,
): string => {
  if (item.archivedAt) {
    const archivedOn = formatDay(gymToday(new Date(item.archivedAt), timeZone));
    const ended = item.membership.status === 'expired';
    return `Archived ${archivedOn} · ${ended ? 'Ended' : 'Ends'} ${formatDay(item.membership.endOn)}`;
  }
  const assessed = item.lastAssessedOn
    ? `Last ${formatDay(item.lastAssessedOn)}`
    : 'Never assessed';
  return `${formatPhone(item.phone)} · ${assessed}`;
};
