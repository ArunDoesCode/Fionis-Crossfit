'use client';

import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import ListRow, { RowList } from '@/components/common/ListRow';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import AssessmentSheet from '@/components/pages/setup/AssessmentSheet';
import MoveButtons from '@/components/pages/setup/MoveButtons';
import { useSheetTarget } from '@/components/pages/setup/useSheetTarget';
import { Button } from '@/components/ui/button';
import type { AssessmentType } from '@/lib/api/setup/fetchers';
import { useAssessmentTypes, useReorderAssessmentTypes } from '@/lib/api/setup/queries';
import { intervalLabel, moveItem } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';

const text = SETUP_TEXT.assessments;

interface AssessmentListProps {
  assessments: readonly AssessmentType[];
  onMove: (index: number, direction: 'up' | 'down') => void;
}

// S15 list (BR-REC-13, 66, 67): one row per assessment, on and off, in setup order. The row opens the
// assessment's measurements; an Off badge says it is turned off (words, not colour alone: BR-REC-125).
function AssessmentList({ assessments, onMove }: AssessmentListProps) {
  return (
    <RowList>
      {assessments.map((assessment, index) => (
        <ListRow
          key={assessment.id}
          title={assessment.name}
          detail={intervalLabel(assessment.intervalCount, assessment.intervalUnit)}
          href={`/admin/settings/assessments/${assessment.id}`}
          status={
            assessment.isActive ? undefined : (
              <StatusBadge tone="neutral">{SETUP_TEXT.assessments.off}</StatusBadge>
            )
          }
          trailing={
            <MoveButtons
              name={assessment.name}
              canMoveUp={index > 0}
              canMoveDown={index < assessments.length - 1}
              onMove={(direction) => onMove(index, direction)}
            />
          }
        />
      ))}
    </RowList>
  );
}

// S15 Assessment setup, the list (`/admin/settings/assessments`), 720 px wide. Main action: Add assessment
// (bar on phones, header from 1024 px). Off assessments are shown too (the catalog is read with
// `includeInactive=true`) so they can be turned on again. Move up / Move down send the whole new order and
// show it at once (BR-REC-67); the catalog is read again on every open (BR-REC-72).
export default function AssessmentSetupView() {
  const catalog = useAssessmentTypes(true);
  const reorder = useReorderAssessmentTypes();
  const sheet = useSheetTarget<AssessmentType | null>();
  const assessments = catalog.data;

  return (
    <Page>
      <PageHeader
        action={
          assessments ? (
            <Button type="button" onClick={() => sheet.show(null)}>
              {text.add}
            </Button>
          ) : undefined
        }
      />
      {assessments === undefined ? (
        catalog.isError ? (
          <ErrorState onRetry={() => catalog.refetch()} />
        ) : (
          <RowSkeletons count={5} />
        )
      ) : assessments.length === 0 ? (
        <EmptyState title={text.empty} />
      ) : (
        <AssessmentList
          assessments={assessments}
          onMove={(index, direction) =>
            reorder.mutate(
              moveItem(
                assessments.map((assessment) => assessment.id),
                index,
                direction,
              ),
            )
          }
        />
      )}
      {sheet.state && (
        <AssessmentSheet
          key={sheet.state.key}
          assessment={sheet.state.target}
          open={sheet.state.open}
          onOpenChange={sheet.onOpenChange}
        />
      )}
    </Page>
  );
}
