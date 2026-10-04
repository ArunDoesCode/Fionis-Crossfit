'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { RowSkeletons } from '@/components/common/Skeletons';
import DeleteConfirmFooter from '@/components/pages/assessments/DeleteConfirmFooter';
import SheetBody from '@/components/pages/setup/SheetBody';
import { Button } from '@/components/ui/button';
import {
  assessmentQueries,
  invalidateAssessmentData,
  useDeleteAssessment,
} from '@/lib/api/assessments/queries';
import { isApiError } from '@/lib/api/errors';
import { assessmentDateLabel, resultCountLabel } from '@/lib/assessments/labels';
import { afterHistorySettles } from '@/lib/assessments/leave';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { AssessmentDetail, AssessmentListItem } from '@/lib/assessments/types';
import { storedValueText } from '@/lib/assessments/valueText';
import { messageForCode } from '@/lib/messages/errors';
import { UI_TEXT, WORDS } from '@/lib/messages/words';

interface AssessmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberId: string;
  assessmentId: string;
  /** The row that was tapped: names the sheet while the values load. Absent when opened from `?open=`. */
  summary?: AssessmentListItem;
  today: string;
  /** Current number of decimals by measurement id (setup), for the fixed digits of a Number. */
  decimals: ReadonlyMap<string, number>;
}

// One saved assessment (S11, BR-REC-88, 89; D18): its values with units (Time as m:ss), [Edit] (the entry
// form at that date, BR-REC-92) and [Delete]. Delete's question is the SECOND STEP of this same sheet,
// never a second sheet: Back is not stack-aware, so a second sheet would leave the first one open (#18).
export default function AssessmentSheet({
  open,
  onOpenChange,
  memberId,
  assessmentId,
  summary,
  today,
  decimals,
}: AssessmentSheetProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  // After a delete the read stops (it would only answer "not found" while the sheet slides away).
  const [gone, setGone] = useState(false);
  const detail = useQuery({ ...assessmentQueries.detail(assessmentId), enabled: !gone });
  const remove = useDeleteAssessment(assessmentId);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  // The buttons are replaced between the steps, so focus is moved on purpose: back at the first step it
  // returns to Delete (the question's own footer puts it on Cancel).
  useEffect(() => {
    if (wasAsking.current && !asking) deleteRef.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  // Another member's assessment (an id typed into the address) is "not found" here, as for the server.
  const data = detail.data?.memberId === memberId ? detail.data : undefined;
  const notFound =
    !data &&
    (detail.data !== undefined || (isApiError(detail.error) && detail.error.status === 404));

  const when = data ?? summary;
  const day = when ? assessmentDateLabel(when.date, when.isEstimated, today) : undefined;
  const count = data ? data.values.length : summary?.valueCount;
  const typeName = data?.typeName ?? summary?.typeName ?? WORDS.assessment;
  const facts = day && count !== undefined ? `${day} · ${resultCountLabel(count)}` : day;

  const edit = (assessment: AssessmentDetail) => {
    // The sheet keeps one extra history entry while it is open: leave only after it has been taken off.
    onOpenChange(false);
    afterHistorySettles(() =>
      router.push(
        `/admin/members/${memberId}/assess?type=${assessment.typeId}&date=${assessment.date}`,
      ),
    );
  };

  const confirmDelete = () =>
    remove.mutate(undefined, {
      onSuccess: () => {
        setGone(true);
        onOpenChange(false);
      },
      onError: (error) => {
        // Already gone (another device): the list is stale, not the question.
        if (isApiError(error) && error.status === 404) void invalidateAssessmentData(queryClient);
      },
    });

  const failure = remove.isError
    ? isApiError(remove.error)
      ? messageForCode(remove.error.code)
      : ASSESSMENT_TEXT.notDeleted
    : null;

  let body: React.ReactNode;
  if (data && asking && day) {
    body = (
      <div role="alert" className="flex flex-col gap-1">
        <p className="text-base font-medium">
          {ASSESSMENT_TEXT.deleteQuestion(data.typeName, day)}
        </p>
        <p className="text-sm text-muted-foreground">
          {ASSESSMENT_TEXT.deleteBody(resultCountLabel(data.values.length))}
        </p>
        {failure && <p className="text-sm text-destructive">{failure}</p>}
      </div>
    );
  } else if (data) {
    body = <Values values={data.values} decimals={decimals} />;
  } else if (notFound || detail.isError) {
    body = (
      <ErrorState
        message={notFound ? messageForCode('NOT_FOUND') : undefined}
        onRetry={notFound ? undefined : () => void detail.refetch()}
      />
    );
  } else {
    body = <RowSkeletons count={3} />;
  }

  let footer: React.ReactNode;
  if (data && asking) {
    footer = (
      <DeleteConfirmFooter
        pending={remove.isPending}
        onCancel={() => {
          remove.reset();
          setAsking(false);
        }}
        onConfirm={confirmDelete}
      />
    );
  } else if (data) {
    footer = (
      <>
        <Button ref={deleteRef} type="button" variant="destructive" onClick={() => setAsking(true)}>
          {ASSESSMENT_TEXT.deleteButton}
        </Button>
        <Button type="button" onClick={() => edit(data)}>
          {UI_TEXT.screens.edit}
        </Button>
      </>
    );
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={typeName}
      description={facts}
      footer={footer}
    >
      <SheetBody>{body}</SheetBody>
    </ResponsiveSheet>
  );
}

// "Body composition  95.5 kg …": one row per stored value in setup order, numbers in the mono font so the
// digits line up (BR-REC-123).
function Values({
  values,
  decimals,
}: {
  values: AssessmentDetail['values'];
  decimals: ReadonlyMap<string, number>;
}) {
  if (values.length === 0) return <EmptyState compact title={ASSESSMENT_TEXT.noSavedResults} />;
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {values.map((result) => (
        <li
          key={result.metricId}
          className="flex min-h-12 items-baseline justify-between gap-4 px-4 py-3"
        >
          <span className="min-w-0 break-words text-base">{result.name}</span>
          <span className="shrink-0 font-mono text-base tabular-nums">
            {storedValueText(result, decimals.get(result.metricId))}
          </span>
        </li>
      ))}
    </ul>
  );
}
