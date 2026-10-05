'use client';

import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import MemberSearch from '@/components/common/MemberSearch';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import DueRow from '@/components/pages/due/DueRow';
import { DueSheet, PeriodSheet } from '@/components/pages/lazySheets';
import EndingRow from '@/components/pages/members/EndingRow';
import MemberDirectoryResults from '@/components/pages/members/MemberDirectoryResults';
import { Skeleton } from '@/components/ui/skeleton';
import { DUE_PREVIEW_SIZE, useDuePreview } from '@/lib/api/due/queries';
import { useEndingPreview, useMemberDirectory } from '@/lib/api/members/queries';
import { dueListHref, tabToStatus } from '@/lib/due/links';
import { emptyDueLine } from '@/lib/due/status';
import type { DueTarget } from '@/lib/due/target';
import type { DueTab } from '@/lib/due/types';
import { useDueSheet } from '@/lib/due/useDueSheet';
import { useTurnedOnCounts } from '@/lib/due/useTurnedOnCounts';
import { foldText, MIN_SEARCH_CHARS, searchMembers } from '@/lib/members/directory';
import { ENDING_EMPTY } from '@/lib/members/endingParams';
import type { EndingStatus } from '@/lib/members/types';
import { useFieldPick } from '@/lib/members/useFieldPick';
import { useRenewTarget } from '@/lib/members/useRenewTarget';
import { useToday } from '@/lib/members/useToday';
import { UI_TEXT } from '@/lib/messages/words';
import { type StatusKey, type StatusTone, toneFor } from '@/lib/statusTone';

const DUE_TITLES = { overdue: UI_TEXT.sections.overdue, soon: UI_TEXT.sections.dueSoon } as const;

const ENDING_SECTION = {
  expiring: { title: UI_TEXT.sections.membershipsEnding, seeAll: '/admin/memberships?tab=ending' },
  expired: { title: UI_TEXT.sections.recentlyEnded, seeAll: '/admin/memberships?tab=ended' },
} as const;

const DOT: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-neutral',
};

interface TileProps {
  label: string;
  /** The `meta.total` of the section's preview. */
  query: { data?: { meta: { total: number } }; isError: boolean };
  tone: StatusKey;
  line: string;
  href: Route;
}

// One tile of the number band: the label, the big number (a grey shape while it loads, "–" when the
// section's preview failed, R-14), and a toned dot with a line of words.
function Tile({ label, query, tone, line, href }: TileProps) {
  const total = query.data?.meta.total;
  return (
    <Link
      href={href}
      className="flex min-w-0 flex-col gap-1 bg-sidebar px-4 py-3 text-sidebar-foreground outline-none hover:bg-sidebar-accent/40 focus-visible:ring-[3px] focus-visible:ring-sidebar-ring focus-visible:ring-inset"
    >
      <span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
      {total === undefined && !query.isError ? (
        <Skeleton className="my-1 h-9 w-12 bg-sidebar-accent" />
      ) : (
        <span className="font-heading text-4xl leading-none font-semibold text-sidebar-primary tabular-nums">
          {total ?? '–'}
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
function NumberBand() {
  const overdue = useDuePreview(tabToStatus('overdue'));
  const soon = useDuePreview(tabToStatus('soon'));
  const ending = useEndingPreview('expiring');
  const ended = useEndingPreview('expired');

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-sidebar-border md:grid-cols-4">
      <Tile
        label={UI_TEXT.sections.overdue}
        query={overdue}
        tone="overdue"
        line="assessments late"
        href={dueListHref('overdue')}
      />
      <Tile
        label={UI_TEXT.sections.dueSoon}
        query={soon}
        tone="soon"
        line="assessments coming up"
        href={dueListHref('soon')}
      />
      <Tile
        label={UI_TEXT.sections.membershipsEnding}
        query={ending}
        tone="ending"
        line="memberships ending soon"
        href="/admin/memberships?tab=ending"
      />
      <Tile
        label={UI_TEXT.sections.recentlyEnded}
        query={ended}
        tone="ended"
        line="ended in the last 30 days"
        href="/admin/memberships?tab=ended"
      />
    </div>
  );
}

// One Home section (BR-REC-16, 101, 131): the title with its count (`meta.total`), the first 5 rows, "See
// all" to S3 on the same tab, and one sentence when nobody is on it. It loads and fails on its own: the other
// sections keep working. The grey shapes are as tall as 5 rows, so the sections below stay put when rows
// arrive (BR-REC-143).
function DueSection({
  tab,
  onMore,
  openTarget,
}: {
  tab: DueTab;
  onMore: (target: DueTarget) => void;
  openTarget: DueTarget | null;
}) {
  const { data, isError, refetch } = useDuePreview(tabToStatus(tab));
  const turnedOn = useTurnedOnCounts();
  const total = data?.meta.total ?? 0;

  return (
    <Section
      title={DUE_TITLES[tab]}
      count={total > 0 ? total : undefined}
      seeAllHref={total > 0 ? dueListHref(tab) : undefined}
      isLoading={!data && !isError}
      loadingFallback={<RowSkeletons count={DUE_PREVIEW_SIZE} chips />}
      isError={!data && isError}
      onRetry={() => void refetch()}
    >
      {data &&
        (data.data.length === 0 ? (
          <EmptyState
            compact
            icon={tab === 'overdue' ? CheckmarkCircle02Icon : undefined}
            title={emptyDueLine(tab)}
          />
        ) : (
          <RowList>
            {data.data.map((item) => (
              <DueRow
                key={`${item.memberId}:${item.typeId}`}
                item={item}
                turnedOnCount={turnedOn.get(item.typeId)}
                onMore={onMore}
                openTarget={openTarget}
              />
            ))}
          </RowList>
        ))}
    </Section>
  );
}

// One Home section (BR-REC-53, 101, 131): the title with its count, the first 5 rows, "See all" to the
// full list, and one sentence when nobody is on it. It loads and fails on its own: the other sections
// keep working.
function EndingSection({
  status,
  onRenew,
}: {
  status: EndingStatus;
  onRenew: (memberId: string) => void;
}) {
  const { data, isError, refetch } = useEndingPreview(status);
  const today = useToday();
  const { title, seeAll } = ENDING_SECTION[status];
  const total = data?.meta.total ?? 0;

  return (
    <Section
      title={title}
      count={total > 0 ? total : undefined}
      seeAllHref={total > 0 ? seeAll : undefined}
      isLoading={!data && !isError}
      loadingFallback={<RowSkeletons count={3} chips />}
      isError={!data && isError}
      onRetry={() => void refetch()}
    >
      {data &&
        (data.data.length === 0 ? (
          <EmptyState compact title={ENDING_EMPTY[status]} />
        ) : (
          <RowList>
            {data.data.map((item) => (
              <EndingRow
                key={item.memberId}
                item={item}
                status={status}
                today={today}
                onRenew={onRenew}
              />
            ))}
          </RowList>
        ))}
    </Section>
  );
}

// The Home search (BR-REC-07, 140, 201, 204, 231): the field follows the text (digits -> Phone, @ -> Email,
// else Name) unless it was picked by hand; type 2 letters, the matching members appear as rows under the
// field, tap one to open them. Archived members are not found here (BR-REC-06); they are under Members →
// Archived. Text and field live in state only. The results area keeps a minimum height so the page does
// not jump when rows arrive (BR-REC-143).
function HomeSearch() {
  const [text, setText] = useState('');
  const { field, pick } = useFieldPick(text);
  const { data, isError, refetch } = useMemberDirectory();
  const rows = useMemo(
    () => data && searchMembers(data, { text, field, archived: false }),
    [data, text, field],
  );
  const ready = foldText(text).length >= MIN_SEARCH_CHARS;

  return (
    <div className="flex flex-col gap-3">
      <MemberSearch text={text} field={field} onChange={setText} onFieldChange={pick} />
      {ready && (
        <div className="min-h-48">
          <MemberDirectoryResults
            rows={rows}
            isError={isError}
            onRetry={() => void refetch()}
            skeletonRows={3}
            empty={<EmptyState compact title={`No member matches "${text.trim()}".`} />}
          />
        </div>
      )}
    </div>
  );
}

// Home (S2, `/admin`). Under the search: the navy number band (BR-REC-222). Order on a phone is BR-REC-101: Overdue, Due soon, Memberships ending, Recently
// ended, under the search field. From 1024 px: due sections left, membership sections right, 1080 px. A row
// tap opens Record assessment (1 tap, BR-REC-140); the row's "⋯" opens the one sheet both due sections
// share. Renew on a row opens the S9 sheet, so Renew from Home is two taps (BR-REC-140); one sheet serves
// both membership sections.
export default function HomeView() {
  const dueSheet = useDueSheet();
  const renew = useRenewTarget();

  return (
    <Page>
      <PageHeader />
      <HomeSearch />
      <NumberBand />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <div className="section-gap flex flex-col">
          <DueSection tab="overdue" onMore={dueSheet.show} openTarget={dueSheet.openTarget} />
          <DueSection tab="soon" onMore={dueSheet.show} openTarget={dueSheet.openTarget} />
          <DueSheet
            target={dueSheet.target}
            session={dueSheet.session}
            open={dueSheet.open}
            onOpenChange={dueSheet.onOpenChange}
          />
        </div>
        <div className="section-gap flex flex-col">
          <EndingSection status="expiring" onRenew={renew.renew} />
          <EndingSection status="expired" onRenew={renew.renew} />
          <PeriodSheet
            memberId={renew.memberId}
            open={renew.open}
            onOpenChange={renew.onOpenChange}
          />
        </div>
      </div>
    </Page>
  );
}
