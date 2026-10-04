import ListRow from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import { preloadPeriodSheet } from '@/components/pages/members/PeriodSheetLazy';
import { Button } from '@/components/ui/button';
import type { IsoDate } from '@/lib/domain/dates';
import { formatPhone } from '@/lib/format';
import { membershipStatusText } from '@/lib/members/membershipText';
import type { EndingItem, EndingStatus } from '@/lib/members/types';

interface EndingRowProps {
  item: EndingItem;
  /** Which list the row is in: it says whether the membership "ends" or "ended". */
  status: EndingStatus;
  today: IsoDate;
  /** Opens the Renew sheet for this member (S9). */
  onRenew: (memberId: string) => void;
}

// One member on a Memberships ending list (S4, Home sections; BR-REC-08, 52, 53, 125): name, phone, the
// status words ("Ends in 4 days", "Ended yesterday") with their colour and icon, and Renew beside the row.
// The whole row opens the member; Renew is a separate control (never inside the link). The words sit under
// the phone, not at the right, so a long name keeps its room next to Renew on a phone.
export default function EndingRow({ item, status, today, onRenew }: EndingRowProps) {
  const text = membershipStatusText({ status, endOn: item.endOn, daysLeft: item.daysLeft }, today);
  return (
    <ListRow
      title={item.fullName}
      detail={formatPhone(item.phone)}
      href={`/admin/members/${item.memberId}`}
      prefetch={false}
      trailing={
        <div className="flex items-center pr-3">
          <Button
            type="button"
            variant="secondary"
            aria-label={`Renew ${item.fullName}`}
            onPointerDown={preloadPeriodSheet}
            onFocus={preloadPeriodSheet}
            onClick={() => onRenew(item.memberId)}
          >
            Renew
          </Button>
        </div>
      }
    >
      <StatusBadge tone={text.tone}>{text.detail}</StatusBadge>
    </ListRow>
  );
}
