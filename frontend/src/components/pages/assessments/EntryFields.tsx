'use client';

import { useMemo } from 'react';
import EmptyState from '@/components/common/EmptyState';
import { FormGrid, FormSection } from '@/components/common/form';
import MetricField from '@/components/pages/assessments/MetricField';
import type { EntryControl } from '@/lib/assessments/entryErrors';
import { layoutMetrics } from '@/lib/assessments/layout';
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

// The measurements as cells of the form's grid (BR-REC-73, 216): untitled cells straight in it, a titled block as
// a FormSection with its parts in a 4-up sub-grid. The screen owns the outer FormGrid.
export default function EntryFields({
  control,
  metrics,
  baseline,
  dueIds,
  stale,
  submitted,
  today,
}: EntryFieldsProps) {
  const blocks = useMemo(() => layoutMetrics(metrics), [metrics]);
  if (metrics.length === 0) {
    return (
      <div className="col-span-full">
        <EmptyState title={ASSESSMENT_TEXT.noMeasurements} />
      </div>
    );
  }
  const cell = (metric: EntryMetric) => (
    <MetricField
      key={metric.id}
      control={control}
      metric={metric}
      index={metrics.indexOf(metric)}
      count={metrics.length}
      hadValue={metric.id in baseline}
      due={dueIds.has(metric.id)}
      stale={stale}
      submitted={submitted}
      today={today}
    />
  );
  return blocks.map((block) =>
    block.title === null ? (
      block.metrics.map(cell)
    ) : (
      <FormSection key={block.title} title={block.title}>
        <FormGrid maxCols={4}>{block.metrics.map(cell)}</FormGrid>
      </FormSection>
    ),
  );
}
