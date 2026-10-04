'use client';

import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import MemberListRow from '@/components/pages/members/MemberListRow';
import PagedRows from '@/components/pages/members/PagedRows';
import type { MemberListPage } from '@/lib/members/types';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';

interface MemberResultsProps {
  query: UseInfiniteQueryResult<InfiniteData<MemberListPage>, Error>;
  /** What to show when there is nothing: one sentence and at most one action (BR-REC-130). */
  empty: React.ReactNode;
  /** Grey rows while the first page loads. */
  skeletonRows?: number;
}

// The member rows of S5 and the Home search (BR-REC-56, 57, 129, 131): paging, loading and errors are
// PagedRows'; this adds the row.
export default function MemberResults({ query, empty, skeletonRows = 8 }: MemberResultsProps) {
  const today = useToday();
  const timeZone = deviceTimeZone();
  return (
    <PagedRows
      query={query}
      empty={empty}
      skeletonRows={skeletonRows}
      renderRow={(item) => (
        <MemberListRow key={item.id} item={item} today={today} timeZone={timeZone} />
      )}
    />
  );
}
