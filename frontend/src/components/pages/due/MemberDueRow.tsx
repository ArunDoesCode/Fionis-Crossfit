'use client';

import ChipList from '@/components/common/ChipList';
import ListRow from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import type { IsoDate } from '@/lib/domain/dates';
import { memberDueStatus } from '@/lib/due/status';
import { type DueTarget, lineTarget } from '@/lib/due/target';
import type { MemberDueItem } from '@/lib/due/types';

interface MemberDueRowProps {
  memberId: string;
  line: MemberDueItem;
  today: IsoDate;
  onMore: (target: DueTarget) => void;
}

// One assessment on the member page (BR-REC-103, 125; C10): its name, ONE status in words (Assess soon,
// Reminder on 20 Oct, Never recorded, Overdue 34 days, Due in 5 days, Next due 12 Dec), the due measurements
// as chips when there are some, and a "⋯" for the same choices as the lists (plus Remove reminder).
export default function MemberDueRow({ memberId, line, today, onMore }: MemberDueRowProps) {
  const status = memberDueStatus(line, today);
  return (
    <ListRow
      title={line.typeName}
      status={<StatusBadge tone={status.tone}>{status.text}</StatusBadge>}
      trailing={
        <DueMoreButton name={line.typeName} onOpen={() => onMore(lineTarget(memberId, line))} />
      }
    >
      {line.items.length > 0 && <ChipList items={line.items.map((chip) => chip.name)} />}
    </ListRow>
  );
}
