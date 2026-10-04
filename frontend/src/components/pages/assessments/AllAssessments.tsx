'use client';

import { useQueryStates } from 'nuqs';
import { useEffect, useMemo } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import { LIST_SKELETON_ROWS } from '@/components/pages/assessments/AllAssessmentsSkeleton';
import AssessmentFilter from '@/components/pages/assessments/AssessmentFilter';
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
import { UI_TEXT } from '@/lib/messages/words';

interface AllAssessmentsProps {
  memberId: string;
}

interface SheetTarget {
  id: string;
  /** The tapped row (absent when the sheet was opened from `?open=`). */
  summary?: AssessmentListItem;
}

// S11 `/admin/members/[memberId]/assessments?type=&open=` (BR-REC-80, 87, 88, 89; D18): the member's saved
// assessments newest first, 25 at a time, filtered by assessment. A row, or `?open=<id>` from the member
// page, opens ONE sheet with the values, Edit and Delete. Each part has its own loading and error state.
export default function AllAssessments({ memberId }: AllAssessmentsProps) {
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
      <PageHeader
        title={UI_TEXT.screens.allAssessments}
        subtitle={member.data?.fullName}
        backHref={`/admin/members/${memberId}`}
      />
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
