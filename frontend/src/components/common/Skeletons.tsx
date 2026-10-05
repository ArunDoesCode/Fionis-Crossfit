import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

// Grey shapes at the real size of what they stand in for (BR-REC-129, 143): a row, an input and the page
// header take their size from the density tokens, so nothing jumps when data arrives.
// Each group is one polite "Loading…" for screen readers.

function Busy({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" role="status" className={className}>
      <span className="sr-only">{UI_TEXT.loading}</span>
      {children}
    </div>
  );
}

/** One list row (--row-height): name, detail line, status at the right. `chips` adds the chip line. */
function RowSkeleton({ chips = false }: { chips?: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 ${chips ? 'h-24' : 'h-row'}`}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-5 w-40 max-w-full" />
        <Skeleton className="h-4 w-56 max-w-full" />
        {chips && <Skeleton className="h-6 w-44 max-w-full rounded-full" />}
      </div>
      <Skeleton className="h-7 w-24 shrink-0 rounded-full" />
    </div>
  );
}

export function RowSkeletons({ count = 3, chips = false }: { count?: number; chips?: boolean }) {
  return (
    <Busy className="divide-y overflow-hidden rounded-2xl border bg-card">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <RowSkeleton key={i} chips={chips} />
      ))}
    </Busy>
  );
}

/** A card-sized block (for example the membership card or a report card section). */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Busy>
      <Skeleton className={cn('h-32 w-full rounded-2xl', className)} />
    </Busy>
  );
}

/** A one-column form: label (20 px) above a field, `fields` times. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Busy className="flex flex-col gap-6">
      {Array.from({ length: fields }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-control w-full rounded-4xl" />
        </div>
      ))}
    </Busy>
  );
}
