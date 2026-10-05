'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useDuePreview } from '@/lib/api/due/queries';
import { useEndingPreview } from '@/lib/api/members/queries';
import { dueListHref, tabToStatus } from '@/lib/due/links';
import { UI_TEXT } from '@/lib/messages/words';
import { type StatusKey, type StatusTone, toneFor } from '@/lib/statusTone';

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
};

interface TileProps {
  label: string;
  /** `undefined` while the section loads (or failed): grey shape instead of a number. */
  total: number | undefined;
  tone: StatusKey;
  line: string;
  href: Route;
}

function Tile({ label, total, tone, line, href }: TileProps) {
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-1 bg-sidebar px-4 py-3 text-sidebar-foreground outline-none hover:bg-sidebar-accent/40 focus-visible:ring-[3px] focus-visible:ring-sidebar-ring focus-visible:ring-inset"
    >
      <span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
      {total === undefined ? (
        <Skeleton className="my-1 h-9 w-12 bg-sidebar-accent" />
      ) : (
        <span className="font-heading text-4xl leading-none font-semibold text-sidebar-primary tabular-nums">
          {total}
        </span>
      )}
      <span className="flex items-center gap-2 text-sm">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${DOT[toneFor(tone)]}`} />
        {line}
      </span>
    </Link>
  );
}

// BR-REC-222: the navy number band under the Home search. The totals are the `meta.total` of the four
// section previews the page already loads (same query keys, no new request). 4 across from 768 px, 2 × 2
// on phones; each tile opens that section's "See all".
export default function NumberBand() {
  const overdue = useDuePreview(tabToStatus('overdue'));
  const soon = useDuePreview(tabToStatus('soon'));
  const ending = useEndingPreview('expiring');
  const ended = useEndingPreview('expired');

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-sidebar-border md:grid-cols-4">
      <Tile
        label={UI_TEXT.sections.overdue}
        total={overdue.data?.meta.total}
        tone="overdue"
        line="assessments late"
        href={dueListHref('overdue')}
      />
      <Tile
        label={UI_TEXT.sections.dueSoon}
        total={soon.data?.meta.total}
        tone="soon"
        line="assessments coming up"
        href={dueListHref('soon')}
      />
      <Tile
        label={UI_TEXT.sections.membershipsEnding}
        total={ending.data?.meta.total}
        tone="ending"
        line="memberships ending soon"
        href="/admin/memberships?tab=ending"
      />
      <Tile
        label={UI_TEXT.sections.recentlyEnded}
        total={ended.data?.meta.total}
        tone="ended"
        line="ended in the last 30 days"
        href="/admin/memberships?tab=ended"
      />
    </div>
  );
}
