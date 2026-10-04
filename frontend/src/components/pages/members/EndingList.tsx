'use client';

import EmptyState from '@/components/common/EmptyState';
import EndingRow from '@/components/pages/members/EndingRow';
import PagedRows from '@/components/pages/members/PagedRows';
import { useEndingList } from '@/lib/api/members/queries';
import { ENDING_EMPTY } from '@/lib/members/endingParams';
import type { EndingStatus } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';

interface EndingListProps {
  status: EndingStatus;
  onRenew: (memberId: string) => void;
}

// One tab of S4 (BR-REC-08, 52, 53, 57): 25 rows, then "Show more". "Ends soon" is soonest first, "Ended"
// is the last 30 days, most recent first (the server's order). Archived members are never listed.
export default function EndingList({ status, onRenew }: EndingListProps) {
  const query = useEndingList(status);
  const today = useToday();

  return (
    <PagedRows
      query={query}
      skeletonChips
      empty={<EmptyState title={ENDING_EMPTY[status]} />}
      renderRow={(item) => (
        <EndingRow
          key={item.memberId}
          item={item}
          status={status}
          today={today}
          onRenew={onRenew}
        />
      )}
    />
  );
}
