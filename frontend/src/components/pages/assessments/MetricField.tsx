'use client';

import type { Dispatch } from 'react';
import DurationField from '@/components/common/DurationField';
import NumberField from '@/components/common/NumberField';
import { ChangeLine, RemovedNote, WarningLine } from '@/components/pages/assessments/FieldLines';
import type { EntryAction } from '@/lib/assessments/entryState';
import { canBeNegative, enterKeyHintFor } from '@/lib/assessments/fieldOptions';
import { changeFor, previousLine, readField, warningFor } from '@/lib/assessments/fieldView';
import { fieldDomId } from '@/lib/assessments/focusField';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { EntryMetric, FieldInput } from '@/lib/assessments/types';

interface MetricFieldProps {
  formId: string;
  metric: EntryMetric;
  /** Place in the screen order: the last field's keypad key says "done" (BR-REC-91). */
  index: number;
  count: number;
  input: FieldInput | undefined;
  /** The field was left once. */
  touched: boolean;
  /** Save was tapped: show every problem (BR-REC-134). */
  attempted: boolean;
  /** The saved assessment holds a value here: emptying the field removes it (BR-REC-77). */
  hadValue: boolean;
  /** A Time box is out of range: the field says why itself. */
  timeProblem: boolean;
  /** This measurement is due (BR-REC-73). */
  due: boolean;
  /** The previous values belong to another date until the new ones arrive: hide them. */
  stale: boolean;
  today: string;
  dispatch: Dispatch<EntryAction>;
}

// One measurement: label, the box(es), "Last 95.5 kg · 12 Sep" at the left and the live change at the right
// (BR-REC-20, 81), "Will be removed" for an emptied saved value (BR-REC-77), the number error (BR-REC-76) and
// "Please check" (BR-REC-82) once the field has been left. Scrolls clear of the sticky header and the bar.
export default function MetricField({
  formId,
  metric,
  index,
  count,
  input,
  touched,
  attempted,
  hadValue,
  timeProblem,
  due,
  stale,
  today,
  dispatch,
}: MetricFieldProps) {
  const id = fieldDomId(formId, metric.id);
  const reading = readField(metric, input);
  const showProblems = touched || attempted;
  const label = due ? `${metric.name} · ${ASSESSMENT_TEXT.due}` : metric.name;
  const previous = stale ? null : previousLine(metric, today);
  const change = stale ? null : changeFor(metric, reading.value);
  const removed = hadValue && reading.blank && !timeProblem;
  const changeNode = removed ? <RemovedNote /> : change ? <ChangeLine change={change} /> : null;
  const warning = showProblems && !stale ? warningFor(metric, reading.value) : null;
  const enterKeyHint = enterKeyHintFor(index, count);
  const leave = () => dispatch({ type: 'touch', metricId: metric.id });
  const className = 'scroll-mt-20 scroll-mb-28';

  return (
    <div className="flex flex-col">
      {metric.datatype === 'duration' ? (
        <DurationField
          id={id}
          label={label}
          value={typeof input === 'number' ? input : null}
          onChange={(seconds, status) =>
            dispatch({ type: 'time', metricId: metric.id, seconds, status })
          }
          onBlur={leave}
          previous={previous}
          change={changeNode}
          enterKeyHint={enterKeyHint}
          className={className}
        />
      ) : (
        <NumberField
          id={id}
          label={label}
          unit={metric.unit}
          allowNegative={canBeNegative(metric.plausibleMin)}
          enterKeyHint={enterKeyHint}
          value={typeof input === 'string' ? input : ''}
          onChange={(value) => dispatch({ type: 'input', metricId: metric.id, value })}
          onBlur={leave}
          previous={previous}
          change={changeNode}
          error={showProblems && reading.invalid ? ASSESSMENT_TEXT.numberError : undefined}
          className={className}
        />
      )}
      {warning && <WarningLine text={warning} />}
    </div>
  );
}
