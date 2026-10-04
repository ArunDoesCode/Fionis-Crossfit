import ListRow from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import type { IsoDate } from '@/lib/domain/dates';
import { memberListDetail } from '@/lib/members/listDetail';
import { memberListBadge } from '@/lib/members/membershipText';
import type { MemberListItem } from '@/lib/members/types';

interface MemberListRowProps {
  item: MemberListItem;
  today: IsoDate;
  timeZone: string;
}

// One member in a list (S5, Home search; BR-REC-07, 125, 135): name, one detail line, the status words at
// the right with their colour and icon. The whole row opens the member.
export default function MemberListRow({ item, today, timeZone }: MemberListRowProps) {
  const badge = memberListBadge(item, today);
  return (
    <ListRow
      title={item.fullName}
      detail={memberListDetail(item, today, timeZone)}
      status={<StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
      href={`/admin/members/${item.id}`}
      prefetch={false}
    />
  );
}
