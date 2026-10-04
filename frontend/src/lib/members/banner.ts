import { gymToday, type IsoDate } from '@/lib/domain/dates';
import { FIXED_LINES } from '@/lib/messages/words';
import { formatDayWithYear } from './dayText';
import type { MembershipStatus } from './types';

/**
 * BR-REC-172: the line at the top of the page of an archived member or of one whose membership has
 * ended: "Archived 2 Jun 2026 · Membership ended 31 May 2026". The archived part only when archived,
 * "ends" while the membership still runs (an ending-today membership still runs, BR-REC-52).
 * `archivedAt` (ISO UTC) becomes a day in `timeZone`. Nothing to say → null. Dates do not depend on
 * `today`; it stays in the signature for the call sites that already have it.
 */
export const memberBannerText = (
  member: { archivedAt: string | null; membership: { status: MembershipStatus; endOn: IsoDate } },
  _today: IsoDate,
  timeZone: string,
): string | null => {
  const ended = member.membership.status === 'expired';
  if (!member.archivedAt && !ended) return null;
  return FIXED_LINES.archivedEndedBanner({
    archivedOn: member.archivedAt
      ? formatDayWithYear(gymToday(new Date(member.archivedAt), timeZone))
      : null,
    membershipEndOn: formatDayWithYear(member.membership.endOn),
    membershipEnded: ended,
  });
};
