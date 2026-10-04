'use client';

import { useQueryState } from 'nuqs';
import EndingList from '@/components/pages/members/EndingList';
import PeriodSheet from '@/components/pages/members/PeriodSheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { endingTabParser, isEndingTab } from '@/lib/members/endingParams';
import { useRenewTarget } from '@/lib/members/useRenewTarget';
import { WORDS } from '@/lib/messages/words';

// S4 (BR-REC-08, 53): the tabs "Ends soon" and "Ended". The tab is in the URL (`?tab=ending|ended`) so the
// Home "See all" links land on the right one and Back from a member returns to the same list. Renew on a
// row opens the S9 sheet (one sheet for both lists).
export default function EndingTabs() {
  const [tab, setTab] = useQueryState('tab', endingTabParser);
  const renew = useRenewTarget();

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (isEndingTab(next)) void setTab(next);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="ending">{WORDS.endsSoon}</TabsTrigger>
          <TabsTrigger value="ended">{WORDS.ended}</TabsTrigger>
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
