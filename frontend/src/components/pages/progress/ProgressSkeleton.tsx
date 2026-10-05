import { CardSkeleton, RowSkeletons } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

/** The filter grid: 2 columns on a phone, 3 up to 1279 px, one row of six from 1280 px (it needs about 870 px). */
export const FILTER_GRID =
  'grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 xl:grid-cols-[minmax(11rem,2fr)_minmax(10rem,1.3fr)_minmax(10rem,1.3fr)_minmax(9rem,1fr)_minmax(7rem,0.8fr)_minmax(7rem,0.8fr)]';
/** The measurement field: a line of its own until the one-row layout. */
export const FILTER_FIRST = 'col-span-2 sm:col-span-3 xl:col-span-1';

// Grey shapes in the real layout of S13 (BR-REC-129, 143): the same grid as `ProgressFilterBar`, then the
// results, the leaderboard and the plan counts as `GymProgressView` places them.

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-12 w-full rounded-4xl" />
    </div>
  );
}

/** The filter row: 20 px label above a 48 px control, six times. */
export function FiltersSkeleton() {
  return (
    <div aria-busy="true" role="status" className={FILTER_GRID}>
      <span className="sr-only">{UI_TEXT.loading}</span>
      <FieldSkeleton className={FILTER_FIRST} />
      <FieldSkeleton />
      <FieldSkeleton />
      <FieldSkeleton className="col-span-2 sm:col-span-1" />
      <FieldSkeleton />
      <FieldSkeleton />
    </div>
  );
}

export default function ProgressSkeleton() {
  return (
    <>
      <FiltersSkeleton />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto_1fr] lg:items-start">
        <CardSkeleton className="h-48" />
        <div className="flex flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex min-h-11 items-center">
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-12 w-full rounded-4xl" />
          <RowSkeletons count={5} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex min-h-11 items-center">
            <Skeleton className="h-6 w-56 max-w-full" />
          </div>
          <CardSkeleton className="h-61" />
        </div>
      </div>
    </>
  );
}
