'use client';

import { useQueryStates } from 'nuqs';
import { useEffect, useMemo } from 'react';
import ChoiceChips from '@/components/common/ChoiceChips';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import {
  FilterSkeleton,
  LIST_SKELETON_ROWS,
} from '@/components/pages/assessments/AllAssessmentsSkeleton';
import AssessmentRow from '@/components/pages/assessments/AssessmentRow';
import AssessmentSheetLazy, {
  preloadAssessmentSheet,
} from '@/components/pages/assessments/AssessmentSheetLazy';
import PagedRows from '@/components/pages/members/PagedRows';
import { useSheetTarget } from '@/components/pages/setup/useSheetTarget';
import { useAssessmentList } from '@/lib/api/assessments/listQueries';
import { isApiError } from '@/lib/api/errors';
import { useMember } from '@/lib/api/members/queries';
import { useAssessmentTypes } from '@/lib/api/setup/queries';
import { idFromParam, listParams, useOpenParam } from '@/lib/assessments/listParams';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { AssessmentListItem } from '@/lib/assessments/types';
import { useToday } from '@/lib/members/useToday';
import { messageForCode } from '@/lib/messages/errors';

interface AllAssessmentsViewProps {
  memberId: string;
}

const ALL = 'all';

interface AssessmentFilterProps {
  /** The assessments to offer, in setup order; undefined while loading. */
  assessments: { id: string; name: string }[] | undefined;
  loadFailed: boolean;
  onRetry: () => void;
  /** The chosen assessment, or `null` for All. */
  typeId: string | null;
  onChange: (typeId: string | null) => void;
}

// S11 filter (BR-REC-89): All + one chip per assessment. It lives in the address (`?type=`), so Back from an
// assessment returns to the same list. Its own loading and error state; the rows below work without it.
function AssessmentFilter({
  assessments,
  loadFailed,
  onRetry,
  typeId,
  onChange,
}: AssessmentFilterProps) {
  if (loadFailed) return <ErrorState onRetry={onRetry} />;
  if (!assessments) return <FilterSkeleton />;

  const options = [
    { value: ALL, label: ASSESSMENT_TEXT.filterAll },
    ...assessments.map(({ id, name }) => ({ value: id, label: name })),
  ];
  return (
    <ChoiceChips
      legend={ASSESSMENT_TEXT.filterLegend}
      hideLegend
      options={options}
      value={typeId ?? ALL}
      onChange={(value) => onChange(value === ALL ? null : value)}
    />
  );
}

interface SheetTarget {
  id: string;
  /** The tapped row (absent when the sheet was opened from `?open=`). */
  summary?: AssessmentListItem;
}

// Its content (`/admin/members/[memberId]/assessments?type=&open=` (BR-REC-80, 87, 88, 89; D18): the member's saved
// assessments newest first, 25 at a time, filtered by assessment. A row, or `?open=<id>` from the member
// page, opens ONE sheet with the values, Edit and Delete. Each part has its own loading and error state.
function AllAssessments({ memberId }: AllAssessmentsViewProps) {
  const today = useToday();
  const member = useMember(memberId);
  const [{ type, open }, setParams] = useQueryStates(listParams);
  const typeId = idFromParam(type);
  // Every assessment, off ones too: a saved assessment of one that is now off still needs its digits.
  const catalog = useAssessmentTypes(true);
  const list = useAssessmentList({ memberId, typeId: typeId ?? undefined });
  const sheet = useSheetTarget<SheetTarget>();
  const { show } = sheet;
  useOpenParam(open, (id) => show({ id }));

  const decimals = useMemo(
    () =>
      new Map(
        catalog.data?.flatMap((item) => item.metrics.map((m) => [m.id, m.decimals] as const)),
      ),
    [catalog.data],
  );
  const filterTypes = catalog.data?.filter((item) => item.isActive || item.id === typeId);
  const typeName = catalog.data?.find((item) => item.id === typeId)?.name;

  // The code of the sheet loads once the rows are there, so a tap does not wait for it.
  const hasRows = (list.data?.pages[0]?.data.length ?? 0) > 0;
  useEffect(() => {
    if (hasRows) preloadAssessmentSheet();
  }, [hasRows]);

  // E27 answers an empty list for a member it does not know: only the member read can say "not found".
  const memberMissing = isApiError(member.error) && member.error.status === 404;

  let emptyText: string = ASSESSMENT_TEXT.noAssessments;
  if (typeId !== null) {
    emptyText = typeName ? ASSESSMENT_TEXT.nothingFor(typeName) : ASSESSMENT_TEXT.nothingForThis;
  }

  return (
    <>
      <PageHeader subtitle={member.data?.fullName} />
      {memberMissing ? (
        <ErrorState message={messageForCode('NOT_FOUND')} />
      ) : (
        <>
          <AssessmentFilter
            assessments={filterTypes}
            loadFailed={catalog.isError}
            onRetry={() => void catalog.refetch()}
            typeId={typeId}
            onChange={(next) => void setParams({ type: next })}
          />
          <PagedRows
            query={list}
            skeletonRows={LIST_SKELETON_ROWS}
            empty={<EmptyState title={emptyText} />}
            renderRow={(item) => (
              <AssessmentRow
                key={item.id}
                item={item}
                today={today}
                onClick={() => show({ id: item.id, summary: item })}
              />
            )}
          />
        </>
      )}
      {sheet.state && (
        <AssessmentSheetLazy
          key={sheet.state.key}
          open={sheet.state.open}
          onOpenChange={sheet.onOpenChange}
          memberId={memberId}
          assessmentId={sheet.state.target.id}
          summary={sheet.state.target.summary}
          today={today}
          decimals={decimals}
        />
      )}
    </>
  );
}

// S11 All assessments (`/admin/members/[memberId]/assessments`, 720 px wide, BR-REC-139). The filter and the
// assessment to open are in the address (`?type=`, `?open=`), read by the client leaf under the route's
// loading.tsx; the rows come from the browser's own requests.
export default function AllAssessmentsView({ memberId }: AllAssessmentsViewProps) {
  return (
    <Page width="narrow">
      <AllAssessments memberId={memberId} />
    </Page>
  );
}
