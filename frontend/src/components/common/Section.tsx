import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import Link from 'next/link';
import ErrorState from '@/components/common/ErrorState';
import { RowSkeletons } from '@/components/common/Skeletons';
import { UI_TEXT } from '@/lib/messages/words';
import { cn } from '@/lib/utils';

interface SectionProps<T extends string> {
  title: string;
  /** Total shown next to the title ("Overdue 12"). */
  count?: number;
  /** "See all" link at the right of the title. */
  seeAllHref?: Route<T>;
  /** The section's own loading state (BR-REC-129). Default fallback: three row skeletons. */
  isLoading?: boolean;
  loadingFallback?: React.ReactNode;
  /** The section's own error (BR-REC-131): the rest of the screen keeps working. */
  isError?: boolean;
  onRetry?: () => void;
  className?: string;
  children?: React.ReactNode;
}

// A titled block with its own loading and error state. Use inside Suspense or with query state.
// An empty section shows one EmptyState line as children (BR-REC-101, 130).
export default function Section<T extends string>({
  title,
  count,
  seeAllHref,
  isLoading = false,
  loadingFallback,
  isError = false,
  onRetry,
  className,
  children,
}: SectionProps<T>) {
  return (
    <section aria-label={title} className={cn('flex flex-col gap-3', className)}>
      <div className="flex min-h-11 items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-heading text-lg font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-base font-normal text-muted-foreground tabular-nums">
              {count}
            </span>
          )}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-base font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {UI_TEXT.seeAll}
            <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
            <span className="sr-only">{title}</span>
          </Link>
        )}
      </div>
      {isError ? (
        <ErrorState onRetry={onRetry} />
      ) : isLoading ? (
        (loadingFallback ?? <RowSkeletons />)
      ) : (
        children
      )}
    </section>
  );
}
