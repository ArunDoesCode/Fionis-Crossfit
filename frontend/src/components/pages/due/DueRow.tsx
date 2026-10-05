'use client';

import ListRow from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import ChipList from '@/components/pages/due/ChipList';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { recordHref } from '@/lib/due/links';
import { dueRowStatus } from '@/lib/due/status';
import { type DueTarget, listTarget } from '@/lib/due/target';
import type { DueListItem } from '@/lib/due/types';

interface DueRowProps {
  item: DueListItem;
  /** Opens the row sheet for this row. */
  onMore: (target: DueTarget) => void;
}

// One member + assessment on Home and S3 (BR-REC-16, 96, 102, 125): the name, the assessment under it, the
// due measurements as chips (+N), the status words at the right and a "⋯" beside the row. The whole row opens
// Record assessment for that member and assessment: 1 tap from Home (BR-REC-140). The "⋯" is a separate
// control, never inside the link.
export default function DueRow({ item, onMore }: DueRowProps) {
  const status = dueRowStatus(item);
  return (
    <ListRow
      title={item.fullName}
      detail={item.typeName}
      href={recordHref(item.memberId, item.typeId)}
      status={<StatusBadge tone={status.tone}>{status.text}</StatusBadge>}
      trailing={<DueMoreButton name={item.fullName} onOpen={() => onMore(listTarget(item))} />}
    >
      {item.items.length > 0 && <ChipList items={item.items.map((chip) => chip.name)} />}
    </ListRow>
  );
}
