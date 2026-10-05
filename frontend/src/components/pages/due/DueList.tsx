'use client';

import dynamic from 'next/dynamic';
import EmptyState from '@/components/common/EmptyState';
import DueRow from '@/components/pages/due/DueRow';
import PagedRows from '@/components/pages/members/PagedRows';
import { useDueList } from '@/lib/api/due/queries';
import { tabToStatus } from '@/lib/due/links';
import { emptyDueLine } from '@/lib/due/status';
import type { DueTarget } from '@/lib/due/target';
import type { DueTab } from '@/lib/due/types';

// From 1024 px (lg) the rows become a DataTable (BR-REC-183); its code loads only then.
const DueTable = dynamic(() => import('@/components/pages/due/DueTable'));

interface DueListProps {
  tab: DueTab;
  /** The assessment filter, or null for "All". */
  typeId: string | null;
  onMore: (target: DueTarget) => void;
}

// One tab of S3 (BR-REC-104): 25 rows, then "Show more", in the server's order (Assess soon first, then
// the earliest due date, then the name). Nobody on it is one sentence.
export default function DueList({ tab, typeId, onMore }: DueListProps) {
  const query = useDueList(tabToStatus(tab), typeId);

  return (
    <PagedRows
      query={query}
      skeletonChips
      empty={<EmptyState title={emptyDueLine(tab)} />}
      renderTable={(items) => <DueTable items={items} onMore={onMore} />}
      renderRow={(item) => (
        <DueRow key={`${item.memberId}:${item.typeId}`} item={item} onMore={onMore} />
      )}
    />
  );
}
