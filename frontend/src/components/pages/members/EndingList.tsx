'use client';

import dynamic from 'next/dynamic';
import EmptyState from '@/components/common/EmptyState';
import EndingRow from '@/components/pages/members/EndingRow';
import PagedRows from '@/components/pages/members/PagedRows';
import { useEndingList } from '@/lib/api/members/queries';
import { ENDING_EMPTY } from '@/lib/members/endingParams';
import type { EndingStatus } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';

// From 1024 px (lg) the rows become a DataTable (BR-REC-183); its code loads only then.
const EndingTable = dynamic(() => import('@/components/pages/members/EndingTable'));

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
      renderTable={(items) => (
        <EndingTable items={items} status={status} today={today} onRenew={onRenew} />
      )}
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
