import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ListRowProps<T extends string> {
  title: string;
  /** One detail line under the title (BR-REC-135). */
  detail?: React.ReactNode;
  /** Status at the right, usually a StatusBadge. */
  status?: React.ReactNode;
  /** Extra line under the detail, usually a ChipList. */
  children?: React.ReactNode;
  /** Whole row is a link (preferred) ... */
  href?: Route<T>;
  /** ... or a button. Both need `aria-label` only when the title alone is unclear. */
  onClick?: () => void;
  /** Hover/touch-start prefetch hooks for long lists that use `prefetch={false}` (tactic 6). */
  prefetch?: boolean;
  /** A separate control beside the row (for example a "⋯" button). Never put it inside the link. */
  trailing?: React.ReactNode;
}

const ROW =
  'flex min-h-row min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 hover:bg-muted/50';

// A list row (BR-REC-122, 135): at least 56 px (we use 64), name, one detail line, status at the right.
// Render inside <RowList>.
export default function ListRow<T extends string>({
  title,
  detail,
  status,
  children,
  href,
  onClick,
  prefetch,
  trailing,
}: ListRowProps<T>) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-base font-medium">{title}</span>
        {detail && <span className="truncate text-sm text-muted-foreground">{detail}</span>}
        {children && <span className="mt-1 block">{children}</span>}
      </span>
      {status && <span className="shrink-0">{status}</span>}
    </>
  );

  return (
    <li className="flex items-stretch">
      {href ? (
        <Link href={href} prefetch={prefetch} className={ROW}>
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={ROW}>
          {content}
        </button>
      ) : (
        <div className={ROW}>{content}</div>
      )}
      {trailing}
    </li>
  );
}

// The list around the rows: dividers between rows, a rounded border, no table (BR-REC-135).
export function RowList({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <ul
      className={cn(
        'divide-y overflow-hidden rounded-2xl border bg-card text-card-foreground',
        className,
      )}
    >
      {children}
    </ul>
  );
}
