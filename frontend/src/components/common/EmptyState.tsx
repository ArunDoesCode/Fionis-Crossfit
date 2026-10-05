import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** One plain sentence ("Nobody is overdue.", "No members yet."). BR-REC-130. */
  title: string;
  /** Kept for DataTable; screens normally need only the one sentence. */
  description?: string;
  /** At most one action ("Add member"). */
  action?: React.ReactNode;
  /** Left-aligned, no box: for inside a Section. */
  compact?: boolean;
  className?: string;
}

export default function EmptyState({
  title,
  description,
  action,
  compact = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2',
        compact
          ? 'items-start py-1'
          : 'items-center justify-center rounded-2xl border border-dashed border-primary/40 bg-brand-wash p-8 text-center',
        className,
      )}
    >
      <p className={cn('text-base', compact ? 'text-muted-foreground' : 'font-medium')}>{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
