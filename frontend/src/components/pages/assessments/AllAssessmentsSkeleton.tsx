import { RowSkeletons } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

/** How many grey rows stand in for the first page (rows are 64 px, like the real ones). */
export const LIST_SKELETON_ROWS = 8;

// The filter row while the assessments are on their way: three chips (44 px) and the reserved 20 px line
// the real chips keep under them, so nothing moves when they arrive (BR-REC-129, 143).
export function FilterSkeleton() {
  return (
    <div aria-busy="true" role="status" className="flex h-[4.5rem] gap-2">
      <span className="sr-only">{UI_TEXT.loading}</span>
      <Skeleton className="h-11 w-14 rounded-full" />
      <Skeleton className="h-11 w-36 rounded-full" />
      <Skeleton className="h-11 w-28 rounded-full" />
    </div>
  );
}

// All assessments (S11) while it loads: the chips, then the rows. Used by the route's loading.tsx (no
// client code, so the server can draw it).
export default function AllAssessmentsSkeleton() {
  return (
    <>
      <FilterSkeleton />
      <RowSkeletons count={LIST_SKELETON_ROWS} />
    </>
  );
}
