'use client';

import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import AssessmentList from '@/components/pages/setup/AssessmentList';
import AssessmentSheet from '@/components/pages/setup/AssessmentSheet';
import { useSheetTarget } from '@/components/pages/setup/useSheetTarget';
import { Button } from '@/components/ui/button';
import type { AssessmentType } from '@/lib/api/setup/fetchers';
import { useAssessmentTypes, useReorderAssessmentTypes } from '@/lib/api/setup/queries';
import { moveItem } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';

const text = SETUP_TEXT.assessments;

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
    <Page width="narrow">
      <PageHeader
        title={text.title}
        backHref="/admin/settings"
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
