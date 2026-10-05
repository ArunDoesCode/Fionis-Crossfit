'use client';

import dynamic from 'next/dynamic';
import { useQueryStates } from 'nuqs';
import ChoiceChips from '@/components/common/ChoiceChips';
import EmptyState from '@/components/common/EmptyState';
import DueRow from '@/components/pages/due/DueRow';
import { DueSheet } from '@/components/pages/lazySheets';
import PagedRows from '@/components/pages/members/PagedRows';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDueList } from '@/lib/api/due/queries';
import { useAssessmentTypes } from '@/lib/api/setup/queries';
import { tabToStatus } from '@/lib/due/links';
import { dueListSearchParams, isDueTab } from '@/lib/due/searchParams';
import { emptyDueLine } from '@/lib/due/status';
import type { DueTarget } from '@/lib/due/target';
import { DUE_TEXT } from '@/lib/due/text';
import type { DueTab } from '@/lib/due/types';
import { useDueSheet } from '@/lib/due/useDueSheet';
import { UI_TEXT } from '@/lib/messages/words';

/** The "All" chip's value; the other chips use the assessment's id (an id is never this word). */
const ALL = 'all';

// From 1024 px (lg) the rows become a DataTable (BR-REC-183); its code loads only then.
const DueTable = dynamic(() => import('@/components/pages/due/DueTable'));

interface DueListProps {
  tab: DueTab;
  /** The assessment filter, or null for "All". */
  typeId: string | null;
  onMore: (target: DueTarget) => void;
}

// One tab of S3 (BR-REC-104): 25 rows, then "Show more", in the server's order (Assess soon first, then
// the earliest due date, then the name). Nobody on it is one sentence.
function DueList({ tab, typeId, onMore }: DueListProps) {
  const query = useDueList(tabToStatus(tab), typeId);

  return (
    <PagedRows
      query={query}
      skeletonChips
      empty={<EmptyState title={emptyDueLine(tab)} />}
      renderTable={(items) => <DueTable items={items} onMore={onMore} />}
      renderRow={(item) => (
        <DueRow key={`${item.memberId}:${item.typeId}`} item={item} onMore={onMore} />
      )}
    />
  );
}

// S3 (BR-REC-104, C11): the tabs Overdue · Due soon, the filter chips "All" + every turned-on assessment in
// setup order, and the rows. The tab and the filter are in the URL (`?tab=overdue|soon&type=<id>`), so the
// Home "See all" links land on the right tab and Back from Record assessment returns to the same list. The
// catalog is read-only here; while it loads (or fails) only "All" shows. One row sheet serves both tabs.
// A chip change keeps the old rows on screen (dimmed) until the new ones arrive; a tab switch mounts that
// tab's own list, which shows grey rows (or its cached rows) because the other tab's panel is unmounted.
export default function DueListPanel() {
  const [{ tab, type }, setParams] = useQueryStates(dueListSearchParams);
  const sheet = useDueSheet();
  const { data: assessments } = useAssessmentTypes(false);
  const options = [
    { value: ALL, label: DUE_TEXT.all },
    ...(assessments ?? []).map((assessment) => ({ value: assessment.id, label: assessment.name })),
  ];

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (isDueTab(next)) void setParams({ tab: next });
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="overdue">{UI_TEXT.sections.overdue}</TabsTrigger>
          <TabsTrigger value="soon">{UI_TEXT.sections.dueSoon}</TabsTrigger>
        </TabsList>
        <ChoiceChips
          legend={DUE_TEXT.assessmentFilter}
          hideLegend
          options={options}
          value={type ?? ALL}
          onChange={(value) => void setParams({ type: value === ALL ? null : value })}
          className="mt-2"
        />
        <TabsContent value="overdue">
          <DueList tab="overdue" typeId={type} onMore={sheet.show} />
        </TabsContent>
        <TabsContent value="soon">
          <DueList tab="soon" typeId={type} onMore={sheet.show} />
        </TabsContent>
      </Tabs>
      <DueSheet
        target={sheet.target}
        session={sheet.session}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
      />
    </>
  );
}
