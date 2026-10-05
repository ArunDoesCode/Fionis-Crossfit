'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormErrorSummary, focusField, useFocusFirstProblem } from '@/components/common/form';
import MeasurementFields from '@/components/pages/setup/MeasurementFields';
import SetupSheet from '@/components/pages/setup/SetupSheet';
import { isApiError } from '@/lib/api/errors';
import type { Metric, UpdateMetricBody } from '@/lib/api/setup/fetchers';
import { useCreateMetric, useUpdateMetric } from '@/lib/api/setup/queries';
import { messageForCode } from '@/lib/messages/errors';
import {
  betterChangeNeedsConfirm,
  confirmCopy,
  intervalChangeNeedsConfirm,
} from '@/lib/setup/describe';
import {
  metricCreateBody,
  metricToValues,
  metricUpdateBody,
  newMeasurementValues,
  withTimeDefaults,
} from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { measurementFormSchema } from '@/lib/validators/setup';

interface MeasurementSheetProps {
  /** The assessment the measurement belongs to (E13 adds under it). */
  typeId: string;
  /** The measurement being edited, or `null` to add a new one. */
  measurement: Metric | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FIELD_ORDER = [
  'name',
  'unit',
  'plausibleMin',
  'plausibleMax',
  'intervalCount',
  'tableGroup',
] as const;

const LABELS = {
  name: SETUP_TEXT.measurementSheet.name,
  unit: SETUP_TEXT.measurementSheet.unit,
  plausibleMin: SETUP_TEXT.measurementSheet.pleaseCheckBelow,
  plausibleMax: SETUP_TEXT.measurementSheet.pleaseCheckAbove,
  intervalCount: SETUP_TEXT.measurementSheet.ownRepeatNumber,
  tableGroup: SETUP_TEXT.measurementSheet.group,
};

interface Waiting {
  body: UpdateMetricBody;
  repeat: boolean;
  better: boolean;
}

// Add / edit a measurement (BR-REC-10, 11, 14, 62–65, 69, 71). Kind and unit are locked while it has
// results (BR-REC-11); a changed repeat asks "This changes due dates for all members" and a changed
// "better" on a measurement with results asks "Best results and leaderboards will change for past
// results" first (one question when both change; BR-REC-70, 71, 133), as a second step inside this same
// sheet (SetupSheet). A name already used in this assessment is said next to Name; other server answers
// are toasts from the hooks (a locked answer is the safety net, the fields lock first). Bottom sheet on
// phones, dialog on desktop (BR-REC-138).
export default function MeasurementSheet({
  typeId,
  measurement,
  open,
  onOpenChange,
}: MeasurementSheetProps) {
  const formId = useId();
  const create = useCreateMetric();
  const update = useUpdateMetric();
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const focusFirst = useFocusFirstProblem(FIELD_ORDER);
  const form = useForm<
    z.input<typeof measurementFormSchema>,
    unknown,
    z.output<typeof measurementFormSchema>
  >({
    resolver: zodResolver(measurementFormSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false,
    defaultValues: measurement ? metricToValues(measurement) : newMeasurementValues(),
  });
  const saving = create.isPending || update.isPending;

  const showNameTaken = (err: unknown) => {
    if (isApiError(err) && err.code === 'NAME_TAKEN') {
      form.setError('name', { message: messageForCode(err.code) });
      focusField('name');
    }
  };

  const send = (body: UpdateMetricBody) => {
    if (!measurement) return;
    update.mutate(
      { metricId: measurement.id, body },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          // Back to the form first (it is hidden during the question), so Name can take focus.
          flushSync(() => setWaiting(null));
          showNameTaken(err);
        },
      },
    );
  };

  const onValid = (checked: z.output<typeof measurementFormSchema>) => {
    // A second Enter can arrive before Save turns off: one try, one request.
    if (saving) return;
    const input = withTimeDefaults(checked);
    if (!measurement) {
      create.mutate(
        { typeId, body: metricCreateBody(input) },
        { onSuccess: () => onOpenChange(false), onError: showNameTaken },
      );
      return;
    }
    const body = metricUpdateBody(measurement, input);
    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }
    const repeat = intervalChangeNeedsConfirm(measurement, input);
    const better = betterChangeNeedsConfirm(measurement, input.better);
    if (repeat || better) {
      setWaiting({ body, repeat, better });
      return;
    }
    send(body);
  };

  const confirm = waiting && {
    ...confirmCopy({ repeat: waiting.repeat, better: waiting.better }),
    pending: update.isPending,
    onCancel: () => setWaiting(null),
    onConfirm: () => send(waiting.body),
  };

  return (
    <SetupSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        measurement ? SETUP_TEXT.measurementSheet.editTitle : SETUP_TEXT.measurementSheet.addTitle
      }
      formId={formId}
      saving={saving}
      confirm={confirm}
      wide
    >
      <form id={formId} noValidate onSubmit={form.handleSubmit(onValid, focusFirst)}>
        <FormErrorSummary
          errors={form.formState.errors}
          order={FIELD_ORDER}
          labels={LABELS}
          className="mb-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
        />
        <MeasurementFields
          form={form}
          locked={measurement?.hasValues ?? false}
          isEdit={measurement !== null}
        />
      </form>
    </SetupSheet>
  );
}
