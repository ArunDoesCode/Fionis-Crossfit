import PageHeader from '@/components/common/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

interface EntrySkeletonProps {
  fields?: number;
}

// Grey shapes in the layout of Record assessment (BR-REC-129, 143): the date row, the paper-column chips,
// then each field as label (20 px), input (48 px), the previous / change line (20 px) and the reserved
// problem line (20 px). Used by the route's loading.tsx, before the browser takes over, and while the
// form's data is on its way, so nothing jumps when it arrives.
export function EntrySkeleton({ fields = 5 }: EntrySkeletonProps) {
  return (
    <div aria-busy="true" role="status" className="flex flex-col gap-4">
      <span className="sr-only">{UI_TEXT.loading}</span>
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-12 w-full rounded-4xl" />
        </div>
        <Skeleton className="mt-7 h-12 w-24 shrink-0 rounded-4xl" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-28" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((chip) => (
            <Skeleton key={chip} className="h-11 w-14 rounded-full" />
          ))}
        </div>
      </div>
      {Array.from({ length: fields }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-12 w-full rounded-4xl" />
          <Skeleton className="h-5 w-40 max-w-full" />
          <div className="h-5" />
        </div>
      ))}
    </div>
  );
}

// Record assessment while it loads: the header and grey shapes in the real layout (BR-REC-129, 143). Used by
// the route's loading.tsx and as the fallback until the browser has taken over (the date starts as the
// device's day, so the real screen is drawn in the browser only, as Add member).
export default function EntryLoading() {
  return (
    <>
      <PageHeader pattern="/admin/members/[memberId]/assess" />
      <EntrySkeleton />
    </>
  );
}
