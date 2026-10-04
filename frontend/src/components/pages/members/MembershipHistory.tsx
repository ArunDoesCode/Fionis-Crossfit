import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import ListRow, { RowList } from '@/components/common/ListRow';
import { formatDayWithYear } from '@/lib/members/dayText';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import type { MemberPeriod } from '@/lib/members/types';

interface MembershipHistoryProps {
  /** Every period, newest first (the order E18 answers). */
  periods: readonly MemberPeriod[];
  /** Tapping a row opens "Edit membership" for that period (BR-REC-55). */
  onEdit: (period: MemberPeriod) => void;
}

// "Membership history" under the membership card, only when there is more than one membership (BR-REC-09:
// periods are edited, never deleted). Each row is the plan and its dates, with the year; tap to edit.
export default function MembershipHistory({ periods, onEdit }: MembershipHistoryProps) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-base font-medium">Membership history</h3>
      <RowList>
        {periods.map((period) => (
          <ListRow
            key={period.id}
            title={PLAN_LABELS[period.plan]}
            detail={`${formatDayWithYear(period.startOn)} – ${formatDayWithYear(period.endOn)}`}
            onClick={() => onEdit(period)}
            status={
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            }
          />
        ))}
      </RowList>
    </div>
  );
}
