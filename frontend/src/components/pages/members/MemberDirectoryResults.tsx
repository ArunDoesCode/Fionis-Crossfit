'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import ErrorState from '@/components/common/ErrorState';
import ListRow, { RowList } from '@/components/common/ListRow';
import { RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import type { IsoDate } from '@/lib/domain/dates';
import { memberListDetail } from '@/lib/members/listDetail';
import { memberListBadge } from '@/lib/members/membershipText';
import type { MemberListItem } from '@/lib/members/types';
import { useDesktop } from '@/lib/members/useDesktop';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';

// From 1024 px (lg) the Members rows become a DataTable (BR-REC-183); its code loads only then.
const MemberTable = dynamic(() => import('@/components/pages/members/MemberTable'));

const PAGE = 25;

// One member in a list (S5, Home search; BR-REC-07, 125, 135): name, one detail line, the status words at
// the right with their colour and icon. The whole row opens the member.
function MemberListRow({
  item,
  today,
  timeZone,
}: {
  item: MemberListItem;
  today: IsoDate;
  timeZone: string;
}) {
  const badge = memberListBadge(item, today);
  return (
    <ListRow
      title={item.fullName}
      avatarName={item.fullName}
      detail={memberListDetail(item, today, timeZone)}
      status={<StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
      href={`/admin/members/${item.id}`}
    />
  );
}

interface MemberDirectoryResultsProps {
  /** The matching members, in order; `undefined` while the directory loads. */
  rows: MemberListItem[] | undefined;
  isError: boolean;
  onRetry: () => void;
  /** From 1024 px show a table (Members); Home keeps rows. */
  table?: boolean;
  /** What to show when nobody matches: one sentence and at most one action (BR-REC-130). */
  empty: React.ReactNode;
  skeletonRows?: number;
}

// The member rows of Members and the Home search (BR-REC-201, 202, 204): 25 rows, then "Show more" adds 25
// (back to 25 when the text, field or chip changes, which gives new `rows`). No spinner and no dimming while
// typing: the rows just change.
export default function MemberDirectoryResults({
  rows,
  isError,
  onRetry,
  table = false,
  empty,
  skeletonRows = 8,
}: MemberDirectoryResultsProps) {
  const today = useToday();
  const desktop = useDesktop();
  const [shown, setShown] = useState(PAGE);
  const [seen, setSeen] = useState(rows);
  if (rows !== seen) {
    setSeen(rows);
    setShown(PAGE);
  }

  if (!rows) {
    return isError ? (
      <ErrorState onRetry={() => onRetry()} />
    ) : (
      <RowSkeletons count={skeletonRows} />
    );
  }
  if (rows.length === 0) return empty;

  const items = rows.slice(0, shown);
  return (
    <div className="flex flex-col gap-4">
      {table && desktop ? (
        <MemberTable items={items} today={today} />
      ) : (
        <RowList>
          {items.map((item) => (
            <MemberListRow key={item.id} item={item} today={today} timeZone={deviceTimeZone()} />
          ))}
        </RowList>
      )}
      {rows.length > shown && (
        <Button type="button" variant="secondary" size="lg" onClick={() => setShown(shown + PAGE)}>
          Show more
        </Button>
      )}
    </div>
  );
}
