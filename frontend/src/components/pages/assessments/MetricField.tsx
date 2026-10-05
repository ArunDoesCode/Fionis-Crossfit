'use client';

import { Alert02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  DurationInput,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  NumberInput,
} from '@/components/common/form';
import type { Change } from '@/lib/assessments/change';
import type { EntryControl } from '@/lib/assessments/entryErrors';
import { valueName } from '@/lib/assessments/entryErrors';
import { fieldInput } from '@/lib/assessments/entryValues';
import { canBeNegative, enterKeyHintFor } from '@/lib/assessments/fieldOptions';
import { changeFor, previousLine, readField, warningFor } from '@/lib/assessments/fieldView';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { asDecimals, type EntryMetric } from '@/lib/assessments/types';
import { cn } from '@/lib/utils';

const ARROWS = { up: '▲', down: '▼' } as const;

/** The live change next to a field: "▼ −1.5 kg better" (BR-REC-81). Never colour alone: arrow + words. */
function ChangeLine({ change }: { change: Change }) {
  const tone =
    change.verdict === 'better'
      ? 'text-success'
      : change.verdict === 'worse'
        ? 'text-warning'
        : undefined;
  return (
    <span className={cn('inline-flex items-center gap-1', tone)}>
      {change.arrow !== 'none' && (
        <>
          <span aria-hidden="true">{ARROWS[change.arrow]}</span>
          <span className="sr-only">
            {change.arrow === 'up' ? ASSESSMENT_TEXT.up : ASSESSMENT_TEXT.down}
          </span>
        </>
      )}
      <span>{change.amount}</span>
      {change.verdict && <span>{change.verdict}</span>}
    </span>
  );
}

/** An emptied saved field says so until Save (BR-REC-77). */
function RemovedNote() {
  return <span className="text-warning">{ASSESSMENT_TEXT.willBeRemoved}</span>;
}

/**
 * "Please check — last time 8" in the line under a field (BR-REC-21, 82): amber, with an icon and words, never
 * an error. It takes the place of the "Last …" line inside the field's own height, so it never moves the form;
 * a field has a warning only when it has a readable value, so it never shares the line with a number error.
 */
function WarningLine({ text }: { text: string }) {
  return (
    <p role="status" className="flex items-center gap-1.5 text-sm text-warning">
      <HugeiconsIcon
        icon={Alert02Icon}
        strokeWidth={2}
        aria-hidden="true"
        className="size-4 shrink-0"
      />
      {text}
    </p>
  );
}

interface MetricFieldProps {
  control: EntryControl;
  metric: EntryMetric;
  /** Place in the screen order: the last field's keypad key says "done" (BR-REC-91). */
  index: number;
  count: number;
  /** The saved assessment holds a value here: emptying the field removes it (BR-REC-77). */
  hadValue: boolean;
  /** This measurement is due (BR-REC-73). */
  due: boolean;
  /** The previous values belong to another date until the new ones arrive: hide them. */
  stale: boolean;
  /** Save was tapped once: "please check" shows on every field, not only on the ones that were left. */
  submitted: boolean;
  today: string;
}

// One measurement in the owner's format (BR-REC-187): one FormItem with the floating label, the box(es), and
// one line under them that is the number error (BR-REC-76), else "Please check" (BR-REC-82), else "Last 95.5 kg
// · 12 Sep" at the left with the live change (BR-REC-81) or "Will be removed" (BR-REC-77) at the right.
export default function MetricField({
  control,
  metric,
  index,
  count,
  hadValue,
  due,
  stale,
  submitted,
  today,
}: MetricFieldProps) {
  const label = due ? `${metric.name} · ${ASSESSMENT_TEXT.due}` : metric.name;
  const enterKeyHint = enterKeyHintFor(index, count);
  return (
    <FormField
      control={control}
      name={valueName(metric.id)}
      render={({ field, fieldState }) => {
        const reading = readField(metric, fieldInput(field.value));
        const previous = stale ? null : previousLine(metric, today);
        const change = stale ? null : changeFor(metric, reading.value);
        const warning =
          (fieldState.isTouched || submitted) && !stale ? warningFor(metric, reading.value) : null;
        const right =
          hadValue && reading.blank ? (
            <RemovedNote />
          ) : change ? (
            <ChangeLine change={change} />
          ) : null;
        const text = typeof field.value === 'string' ? field.value : '';
        const duration =
          typeof field.value === 'object' && field.value !== null
            ? field.value
            : { min: '', sec: '' };
        return (
          <FormItem>
            <FormControl>
              {metric.datatype === 'duration' ? (
                <DurationInput
                  label={`${label} (min:sec)`}
                  value={duration}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              ) : (
                <NumberInput
                  label={label}
                  unit={metric.unit}
                  decimals={asDecimals(metric.decimals)}
                  allowNegative={canBeNegative(metric.plausibleMin)}
                  enterKeyHint={enterKeyHint}
                  name={field.name}
                  ref={field.ref}
                  value={text}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            </FormControl>
            {fieldState.error ? (
              <FormMessage />
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-x-3 text-xs text-muted-foreground">
                {warning ? <WarningLine text={warning} /> : <span>{previous}</span>}
                {right}
              </div>
            )}
          </FormItem>
        );
      }}
    />
  );
}
