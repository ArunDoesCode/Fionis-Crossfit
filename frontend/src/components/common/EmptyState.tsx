import { InboxIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** One plain, warm sentence ("Nobody is overdue. Nice work.", "No members yet."). BR-REC-130, 233. */
  title: string;
  /** Kept for DataTable; screens normally need only the one sentence. */
  description?: string;
  /** One icon above (or beside, when compact) the sentence (BR-REC-233). */
  icon?: IconSvgElement;
  /** At most one action ("Add member"). */
  action?: React.ReactNode;
  /** Left-aligned, no box: for inside a Section. */
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  icon = InboxIcon,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex gap-2',
        compact
          ? 'items-center gap-3 py-1'
          : 'flex-col items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-brand-wash p-8 text-center',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground',
          compact ? 'size-8' : 'size-10',
        )}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} className={compact ? 'size-4' : 'size-5'} />
      </span>
      <div className={cn('flex flex-col gap-1', compact ? 'items-start' : 'items-center')}>
        <p className={cn('text-base', compact ? 'text-muted-foreground' : 'font-medium')}>
          {title}
        </p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}
