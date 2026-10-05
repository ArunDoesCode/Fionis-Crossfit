'use client';

import dynamic from 'next/dynamic';
import { useQueryState } from 'nuqs';
import EmptyState from '@/components/common/EmptyState';
import { PeriodSheet } from '@/components/pages/lazySheets';
import EndingRow from '@/components/pages/members/EndingRow';
import PagedRows from '@/components/pages/members/PagedRows';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEndingList } from '@/lib/api/members/queries';
import { withCount } from '@/lib/format';
import { ENDING_EMPTY, endingTabParser, isEndingTab } from '@/lib/members/endingParams';
import type { EndingStatus } from '@/lib/members/types';
import { useRenewTarget } from '@/lib/members/useRenewTarget';
import { useToday } from '@/lib/members/useToday';
import { WORDS } from '@/lib/messages/words';

// From 1024 px (lg) the rows become a DataTable (BR-REC-183); its code loads only then.
const EndingTable = dynamic(() => import('@/components/pages/members/EndingTable'));

// One tab of S4 (BR-REC-08, 52, 53, 57): 25 rows, then "Show more". "Ends soon" is soonest first, "Ended"
// is the last 30 days, most recent first (the server's order). Archived members are never listed.
function EndingList({
  status,
  onRenew,
}: {
  status: EndingStatus;
  onRenew: (memberId: string) => void;
}) {
  const query = useEndingList(status);
  const today = useToday();

  return (
    <PagedRows
      query={query}
      skeletonChips
      empty={<EmptyState title={ENDING_EMPTY[status]} />}
      renderTable={(items) => (
        <EndingTable items={items} status={status} today={today} onRenew={onRenew} />
      )}
      renderRow={(item) => (
        <EndingRow
          key={item.memberId}
          item={item}
          status={status}
          today={today}
          onRenew={onRenew}
        />
      )}
    />
  );
}

// S4 (BR-REC-08, 53): the tabs "Ends soon" and "Ended". The tab is in the URL (`?tab=ending|ended`) so the
// Home "See all" links land on the right one and Back from a member returns to the same list. Renew on a
// row opens the S9 sheet (one sheet for both lists).
export default function EndingTabs() {
  const [tab, setTab] = useQueryState('tab', endingTabParser);
  const renew = useRenewTarget();
  // Tab counts (BR-REC-226) read the same cached lists the tab panels show (same query keys).
  const endingTotal = useEndingList('expiring').data?.pages[0]?.meta.total;
  const endedTotal = useEndingList('expired').data?.pages[0]?.meta.total;

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (isEndingTab(next)) void setTab(next);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="ending">{withCount(WORDS.endsSoon, endingTotal)}</TabsTrigger>
          <TabsTrigger value="ended">{withCount(WORDS.ended, endedTotal)}</TabsTrigger>
        </TabsList>
        <TabsContent value="ending">
          <EndingList status="expiring" onRenew={renew.renew} />
        </TabsContent>
        <TabsContent value="ended">
          <EndingList status="expired" onRenew={renew.renew} />
        </TabsContent>
      </Tabs>
      <PeriodSheet memberId={renew.memberId} open={renew.open} onOpenChange={renew.onOpenChange} />
    </>
  );
}
