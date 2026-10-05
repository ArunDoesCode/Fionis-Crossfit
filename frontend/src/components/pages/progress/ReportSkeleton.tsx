import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout of S12 (BR-REC-129, 143): the header block, then two assessments, each
// as a grid of cards (112 px; BR-REC-229). One polite "Loading…" for the group.
export default function ReportSkeleton() {
  return (
    <div aria-busy="true" role="status" className="flex flex-col gap-6">
      <span className="sr-only">{UI_TEXT.loading}</span>
      <div className="flex flex-col gap-1">
        <Skeleton className="hidden h-8 w-full lg:block" />
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-6 w-40 max-w-full" />
        <Skeleton className="h-6 w-56 max-w-full lg:hidden" />
      </div>
      {['first', 'second'].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-7 w-44 max-w-full" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {['a', 'b', 'c'].map((card) => (
              <Skeleton key={card} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
