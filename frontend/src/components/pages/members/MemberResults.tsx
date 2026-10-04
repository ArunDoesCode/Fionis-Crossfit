'use client';

import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import ErrorState from '@/components/common/ErrorState';
import { RowList } from '@/components/common/ListRow';
import { RowSkeletons } from '@/components/common/Skeletons';
import MemberListRow from '@/components/pages/members/MemberListRow';
import { Button } from '@/components/ui/button';
import type { MemberListPage } from '@/lib/members/types';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface MemberResultsProps {
  query: UseInfiniteQueryResult<InfiniteData<MemberListPage>, Error>;
  /** What to show when there is nothing: one sentence and at most one action (BR-REC-130). */
  empty: React.ReactNode;
  /** Grey rows while the first page loads. */
  skeletonRows?: number;
}

const SHOW_MORE = 'Show more';

// The rows of a member list with their own loading, error and "Show more" (BR-REC-56, 57, 129, 131):
// 25 at a time, the next 25 are added under the rows. While the search text or the chip changes the old
// rows stay (dimmed) instead of flashing grey shapes at every keystroke.
export default function MemberResults({ query, empty, skeletonRows = 8 }: MemberResultsProps) {
  const today = useToday();
  const {
    data,
    isError,
    isPlaceholderData,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = query;

  if (!data) {
    return isError ? (
      <ErrorState onRetry={() => void query.refetch()} />
    ) : (
      <RowSkeletons count={skeletonRows} />
    );
  }

  const items = data.pages.flatMap((page) => page.data);
  if (items.length === 0) return empty;

  const timeZone = deviceTimeZone();
  return (
    <div className="flex flex-col gap-4">
      <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && 'opacity-60')}>
        <RowList>
          {items.map((item) => (
            <MemberListRow key={item.id} item={item} today={today} timeZone={timeZone} />
          ))}
        </RowList>
      </div>
      {isFetchNextPageError && <ErrorState onRetry={() => void query.fetchNextPage()} />}
      {hasNextPage && !isFetchNextPageError && (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {isFetchingNextPage ? UI_TEXT.loading : SHOW_MORE}
        </Button>
      )}
    </div>
  );
}
