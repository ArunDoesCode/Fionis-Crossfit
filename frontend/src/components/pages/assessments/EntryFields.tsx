'use client';

import EmptyState from '@/components/common/EmptyState';
import { FormGrid } from '@/components/common/form';
import MetricField from '@/components/pages/assessments/MetricField';
import type { EntryControl } from '@/lib/assessments/entryErrors';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { EntryMetric } from '@/lib/assessments/types';

interface EntryFieldsProps {
  control: EntryControl;
  metrics: EntryMetric[];
  /** The saved assessment's values by measurement id (emptying one removes it). */
  baseline: Record<string, number>;
  /** Measurement ids that are due (empty until E32 answers, D11). */
  dueIds: Set<string>;
  stale: boolean;
  submitted: boolean;
  today: string;
}

// The measurements in setup order (BR-REC-73). One column for now: the 1 / 2 / 3 / 4 column grid is slice U4,
// which only changes `maxCols` here (BR-REC-188).
export default function EntryFields({
  control,
  metrics,
  baseline,
  dueIds,
  stale,
  submitted,
  today,
}: EntryFieldsProps) {
  if (metrics.length === 0) return <EmptyState title={ASSESSMENT_TEXT.noMeasurements} />;
  return (
    <FormGrid maxCols={1}>
      {metrics.map((metric, index) => (
        <MetricField
          key={metric.id}
          control={control}
          metric={metric}
          index={index}
          count={metrics.length}
          hadValue={metric.id in baseline}
          due={dueIds.has(metric.id)}
          stale={stale}
          submitted={submitted}
          today={today}
        />
      ))}
    </FormGrid>
  );
}
