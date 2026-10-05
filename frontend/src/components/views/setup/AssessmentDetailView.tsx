'use client';

import Link from 'next/link';
import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import ListRow, { RowList } from '@/components/common/ListRow';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import AssessmentSheet from '@/components/pages/setup/AssessmentSheet';
import MeasurementSheet from '@/components/pages/setup/MeasurementSheet';
import MoveButtons from '@/components/pages/setup/MoveButtons';
import { useSheetTarget } from '@/components/pages/setup/useSheetTarget';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { AssessmentType, Metric } from '@/lib/api/setup/fetchers';
import { useAssessmentTypes, useReorderMetrics } from '@/lib/api/setup/queries';
import { measurementDetail, moveItem, repeatLine } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';

const text = SETUP_TEXT.assessments;
const LIST_HREF = '/admin/settings/assessments';

interface MeasurementListProps {
  measurements: readonly Metric[];
  onOpen: (measurement: Metric) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

// S15 detail rows (BR-REC-10, 14, 66, 67): name, "unit · Higher is better", an own repeat on its own line,
// an Off badge, Move up / Move down. Tapping the row opens the measurement sheet.
function MeasurementList({ measurements, onOpen, onMove }: MeasurementListProps) {
  return (
    <RowList>
      {measurements.map((measurement, index) => (
        <ListRow
          key={measurement.id}
          title={measurement.name}
          detail={measurementDetail(measurement)}
          onClick={() => onOpen(measurement)}
          status={
            measurement.isActive ? undefined : (
              <StatusBadge tone="neutral">{SETUP_TEXT.assessments.off}</StatusBadge>
            )
          }
          trailing={
            <MoveButtons
              name={measurement.name}
              canMoveUp={index > 0}
              canMoveDown={index < measurements.length - 1}
              onMove={(direction) => onMove(index, direction)}
            />
          }
        >
          {measurement.intervalCount !== null && measurement.intervalUnit !== null && (
            <span className="text-sm text-muted-foreground">
              {repeatLine(measurement.intervalCount, measurement.intervalUnit)}
            </span>
          )}
        </ListRow>
      ))}
    </RowList>
  );
}

// S15 Assessment setup, one assessment (`/admin/settings/assessments/[typeId]`), 720 px wide. Title = the
// assessment's name with Edit beside it; main action: Add measurement. Rows: name, "unit · better", an
// own repeat, an Off badge, Move up / Move down; a row opens the measurement sheet. An id that is not in
// the catalog says so with a way back (it was never there, or the catalog changed).
export default function AssessmentDetailView({ typeId }: { typeId: string }) {
  const catalog = useAssessmentTypes(true);
  const reorder = useReorderMetrics();
  const assessmentSheet = useSheetTarget<AssessmentType>();
  const measurementSheet = useSheetTarget<Metric | null>();
  const assessment = catalog.data?.find((candidate) => candidate.id === typeId);

  if (catalog.data !== undefined && assessment === undefined) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          title={text.notFound}
          action={
            <Button
              variant="secondary"
              size="lg"
              nativeButton={false}
              render={<Link href={LIST_HREF} />}
            >
              {text.backToList}
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={assessment?.name ?? text.title}
        secondary={
          assessment && (
            <Button type="button" variant="ghost" onClick={() => assessmentSheet.show(assessment)}>
              {text.edit}
            </Button>
          )
        }
        action={
          assessment && (
            <Button type="button" onClick={() => measurementSheet.show(null)}>
              {text.addMeasurement}
            </Button>
          )
        }
      />
      {assessment === undefined ? (
        catalog.isError ? (
          <ErrorState onRetry={() => catalog.refetch()} />
        ) : (
          <>
            <Skeleton className="h-6 w-48 max-w-full" />
            <RowSkeletons count={5} />
          </>
        )
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base">
                {repeatLine(assessment.intervalCount, assessment.intervalUnit)}
              </p>
              {!assessment.isActive && <StatusBadge tone="neutral">{text.off}</StatusBadge>}
            </div>
            {!assessment.isActive && (
              <p className="text-sm text-muted-foreground">{text.offNote}</p>
            )}
          </div>
          {assessment.metrics.length === 0 ? (
            <EmptyState title={text.noMeasurements} />
          ) : (
            <MeasurementList
              measurements={assessment.metrics}
              onOpen={(measurement) => measurementSheet.show(measurement)}
              onMove={(index, direction) =>
                reorder.mutate({
                  typeId: assessment.id,
                  metricIds: moveItem(
                    assessment.metrics.map((metric) => metric.id),
                    index,
                    direction,
                  ),
                })
              }
            />
          )}
        </>
      )}
      {assessmentSheet.state && (
        <AssessmentSheet
          key={`assessment-${assessmentSheet.state.key}`}
          assessment={assessmentSheet.state.target}
          open={assessmentSheet.state.open}
          onOpenChange={assessmentSheet.onOpenChange}
        />
      )}
      {measurementSheet.state && (
        <MeasurementSheet
          key={`measurement-${measurementSheet.state.key}`}
          typeId={typeId}
          measurement={measurementSheet.state.target}
          open={measurementSheet.state.open}
          onOpenChange={measurementSheet.onOpenChange}
        />
      )}
    </Page>
  );
}
