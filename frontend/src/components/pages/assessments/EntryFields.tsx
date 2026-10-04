'use client';

import type { Dispatch } from 'react';
import EmptyState from '@/components/common/EmptyState';
import MetricField from '@/components/pages/assessments/MetricField';
import type { EntryAction, EntryState } from '@/lib/assessments/entryState';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { EntryMetric } from '@/lib/assessments/types';

interface EntryFieldsProps {
  formId: string;
  metrics: EntryMetric[];
  state: EntryState;
  attempted: boolean;
  /** Measurement ids that are due (empty until E32 answers, D11). */
  dueIds: Set<string>;
  stale: boolean;
  today: string;
  dispatch: Dispatch<EntryAction>;
}

// The measurements in setup order (BR-REC-73): one column, 720 px wide on desktop (BR-REC-139).
export default function EntryFields({
  formId,
  metrics,
  state,
  attempted,
  dueIds,
  stale,
  today,
  dispatch,
}: EntryFieldsProps) {
  if (metrics.length === 0) return <EmptyState title={ASSESSMENT_TEXT.noMeasurements} />;
  return (
    <div className="flex flex-col gap-2">
      {metrics.map((metric, index) => (
        <MetricField
          key={metric.id}
          formId={formId}
          metric={metric}
          index={index}
          count={metrics.length}
          input={state.inputs[metric.id]}
          touched={state.touched[metric.id] === true}
          attempted={attempted}
          hadValue={metric.id in state.baseline}
          timeProblem={state.timeProblems[metric.id] === true}
          due={dueIds.has(metric.id)}
          stale={stale}
          today={today}
          dispatch={dispatch}
        />
      ))}
    </div>
  );
}
