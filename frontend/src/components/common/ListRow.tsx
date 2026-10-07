import type { Route } from 'next';
import Link from 'next/link';
import MemberAvatar from '@/components/common/MemberAvatar';
import { cn } from '@/lib/utils';

interface ListRowProps<T extends string> {
  title: string;
  /** A person's row: the shown name for the initials avatar at the start (BR-REC-223). */
  avatarName?: string;
  /** One detail line under the title (BR-REC-135). */
  detail?: React.ReactNode;
  /** Status at the right, usually a StatusBadge. */
  status?: React.ReactNode;
  /** Extra line under the detail, usually a line of quiet text or chips. */
  children?: React.ReactNode;
  /** Whole row is a link (preferred) ... */
  href?: Route<T>;
  /** ... or a button. Both need `aria-label` only when the title alone is unclear. */
  onClick?: () => void;
  /** A separate control beside the row (for example a "⋯" button). Never put it inside the link. */
  trailing?: React.ReactNode;
}

const ROW =
  'flex min-h-row min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors hover:bg-accent/60';

// A list row (BR-REC-122, 135, 223, 225): at least 56 px (we use 64), avatar, name (wraps to two lines, never
// cut to a fragment), one detail line; the status sits under the name below 768 px and at the right from there.
// Render inside <RowList>.
export default function ListRow<T extends string>({
  title,
  avatarName,
  detail,
  status,
  children,
  href,
  onClick,
  trailing,
}: ListRowProps<T>) {
  const content = (
    <>
      {avatarName !== undefined && <MemberAvatar name={avatarName} />}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-base font-semibold break-words">{title}</span>
          {detail && <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>}
          {children && <span className="mt-0.5 block">{children}</span>}
        </span>
        {status && <span className="self-start md:shrink-0 md:self-center">{status}</span>}
      </span>
    </>
  );

  return (
    <li className="flex items-stretch">
      {href ? (
        <Link href={href} className={ROW}>
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
