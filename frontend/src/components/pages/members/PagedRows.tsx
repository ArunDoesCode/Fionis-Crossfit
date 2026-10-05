'use client';

import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import ErrorState from '@/components/common/ErrorState';
import { RowList } from '@/components/common/ListRow';
import { RowSkeletons } from '@/components/common/Skeletons';
import { Button } from '@/components/ui/button';
import { useDesktop } from '@/lib/members/useDesktop';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface PagedRowsProps<Page extends { data: readonly unknown[] }> {
  query: UseInfiniteQueryResult<InfiniteData<Page>, Error>;
  /** One row; it carries its own `key`. */
  renderRow: (item: Page['data'][number]) => React.ReactNode;
  /** From 1024 px (BR-REC-183) the rows are replaced by this table, built from the same items. */
  renderTable?: (items: Page['data'][number][]) => React.ReactNode;
  /** What to show when there is nothing: one sentence and at most one action (BR-REC-130). */
  empty: React.ReactNode;
  /** Grey rows while the first page loads. */
  skeletonRows?: number;
  /** Grey rows with a line for chips / a badge under the detail (the rows that have one). */
  skeletonChips?: boolean;
}

const SHOW_MORE = 'Show more';

// The rows of a server-paged list with their own loading, error and "Show more" (BR-REC-56, 57, 129, 131):
// 25 at a time, the next 25 are added under the rows. While the search text or the chip changes the old
// rows stay (dimmed) instead of flashing grey shapes at every keystroke. Members and Memberships ending
// share it.
export default function PagedRows<Page extends { data: readonly unknown[] }>({
  query,
  renderRow,
  renderTable,
  empty,
  skeletonRows = 8,
  skeletonChips = false,
}: PagedRowsProps<Page>) {
  const desktop = useDesktop();
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
      <RowSkeletons count={skeletonRows} chips={skeletonChips} />
    );
  }

  const items = data.pages.flatMap((page) => page.data);
  if (items.length === 0) return empty;

  return (
    <div className="flex flex-col gap-4">
      <div aria-busy={isPlaceholderData} className={cn(isPlaceholderData && 'opacity-60')}>
        {desktop && renderTable ? renderTable(items) : <RowList>{items.map(renderRow)}</RowList>}
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
