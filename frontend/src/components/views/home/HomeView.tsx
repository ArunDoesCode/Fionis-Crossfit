'use client';

import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import { RowList } from '@/components/common/ListRow';
import MemberSearch from '@/components/common/MemberSearch';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import { RowSkeletons } from '@/components/common/Skeletons';
import DueRow from '@/components/pages/due/DueRow';
import NumberBand from '@/components/pages/home/NumberBand';
import { DueSheet, PeriodSheet } from '@/components/pages/lazySheets';
import EndingRow from '@/components/pages/members/EndingRow';
import MemberDirectoryResults from '@/components/pages/members/MemberDirectoryResults';
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

const DUE_TITLES = { overdue: UI_TEXT.sections.overdue, soon: UI_TEXT.sections.dueSoon } as const;

const ENDING_SECTION = {
  expiring: { title: UI_TEXT.sections.membershipsEnding, seeAll: '/admin/memberships?tab=ending' },
  expired: { title: UI_TEXT.sections.recentlyEnded, seeAll: '/admin/memberships?tab=ended' },
} as const;

// One Home section (BR-REC-16, 101, 131): the title with its count (`meta.total`), the first 5 rows, "See
// all" to S3 on the same tab, and one sentence when nobody is on it. It loads and fails on its own: the other
// sections keep working. The grey shapes are as tall as 5 rows, so the sections below stay put when rows
// arrive (BR-REC-143).
function DueSection({ tab, onMore }: { tab: DueTab; onMore: (target: DueTarget) => void }) {
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
          <DueSection tab="overdue" onMore={dueSheet.show} />
          <DueSection tab="soon" onMore={dueSheet.show} />
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
