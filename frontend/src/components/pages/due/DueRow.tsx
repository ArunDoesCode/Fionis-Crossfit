'use client';

import ListRow from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import DueMoreButton from '@/components/pages/due/DueMoreButton';
import { recordHref } from '@/lib/due/links';
import { dueRowStatus } from '@/lib/due/status';
import { type DueTarget, isSheetOpenFor, listTarget } from '@/lib/due/target';
import { dueItemsText } from '@/lib/due/text';
import type { DueListItem } from '@/lib/due/types';

interface DueRowProps {
  item: DueListItem;
  /** Measurements turned on for this assessment; unknown (undefined) never says "All N" (BR-REC-225). */
  turnedOnCount?: number;
  /** Opens the row sheet for this row. */
  onMore: (target: DueTarget) => void;
  /** The row whose sheet is open now, if any (for the "⋯"'s `aria-expanded`). */
  openTarget: DueTarget | null;
}

// One member + assessment on Home and S3 (BR-REC-16, 96, 102, 125): the name, the assessment under it, the
// due measurements as one line of quiet text (BR-REC-225), the status words at the right and a "⋯" beside the row. The whole row opens
// Record assessment for that member and assessment: 1 tap from Home (BR-REC-140). The "⋯" is a separate
// control, never inside the link.
export default function DueRow({ item, turnedOnCount, onMore, openTarget }: DueRowProps) {
  const status = dueRowStatus(item);
  // One quiet line: the assessment, then what is due ("Body composition · All 15 measurements").
  const items =
    item.items.length > 0
      ? dueItemsText(
          item.items.map((chip) => chip.name),
          turnedOnCount ?? Number.POSITIVE_INFINITY,
        )
      : null;
  const detail = items ? `${item.typeName} · ${items}` : item.typeName;
  return (
    <ListRow
      title={item.fullName}
      avatarName={item.fullName}
      detail={detail}
      href={recordHref(item.memberId, item.typeId)}
      status={<StatusBadge tone={status.tone}>{status.text}</StatusBadge>}
      trailing={
        <DueMoreButton
          name={item.fullName}
          onOpen={() => onMore(listTarget(item))}
          expanded={isSheetOpenFor(openTarget, item.memberId, item.typeId)}
        />
      }
    />
  );
}
