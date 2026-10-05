'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormGrid, focusField, useFocusFirstProblem } from '@/components/common/form';
import {
  ChipsField,
  NumberField,
  SwitchField,
  TextField,
} from '@/components/pages/setup/FormControls';
import SetupSheet from '@/components/pages/setup/SetupSheet';
import { isApiError } from '@/lib/api/errors';
import type { AssessmentType, UpdateAssessmentTypeBody } from '@/lib/api/setup/fetchers';
import { useCreateAssessmentType, useUpdateAssessmentType } from '@/lib/api/setup/queries';
import { messageForCode } from '@/lib/messages/errors';
import { confirmCopy, intervalChangeNeedsConfirm } from '@/lib/setup/describe';
import { assessmentToValues, assessmentUpdateBody, newAssessmentValues } from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { assessmentSheetSchema } from '@/lib/validators/setup';

interface AssessmentSheetProps {
  /** The assessment being edited, or `null` to add a new one. */
  assessment: AssessmentType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const text = SETUP_TEXT.assessmentSheet;

const UNIT_OPTIONS = [
  { value: 'week', label: text.weeks },
  { value: 'month', label: text.months },
] as const;

const FIELD_ORDER = ['name', 'intervalCount'] as const;

type Output = z.output<typeof assessmentSheetSchema>;

// Add / edit an assessment (BR-REC-13, 61, 66, 70): name, repeat number + unit, and (when editing) the On
// switch. A changed repeat asks "This changes due dates for all members" first (BR-REC-70, 133), as a
// second step inside this same sheet (SetupSheet). A name that is already used is said next to the Name
// field (BR-REC-61); every other server answer is a toast from the mutation hook. Bottom sheet on phones,
// dialog on desktop (BR-REC-138).
export default function AssessmentSheet({ assessment, open, onOpenChange }: AssessmentSheetProps) {
  const formId = useId();
  const focusFirst = useFocusFirstProblem(FIELD_ORDER);
  const create = useCreateAssessmentType();
  const update = useUpdateAssessmentType();
  // The changes waiting for the repeat confirmation; `null` when no question is open.
  const [waiting, setWaiting] = useState<UpdateAssessmentTypeBody | null>(null);
  const form = useForm<z.input<typeof assessmentSheetSchema>, unknown, Output>({
    resolver: zodResolver(assessmentSheetSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false,
    defaultValues: assessment ? assessmentToValues(assessment) : newAssessmentValues(),
  });
  const saving = create.isPending || update.isPending;

  const showNameTaken = (err: unknown) => {
    if (isApiError(err) && err.code === 'NAME_TAKEN') {
      form.setError('name', { message: messageForCode(err.code) });
      focusField('name');
    }
  };

  const send = (body: UpdateAssessmentTypeBody) => {
    if (!assessment) return;
    update.mutate(
      { typeId: assessment.id, body },
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

  const onValid = ({ isActive, ...input }: Output) => {
    // A second Enter can arrive before Save turns off: one try, one request.
    if (saving) return;
    if (!assessment) {
      create.mutate(input, { onSuccess: () => onOpenChange(false), onError: showNameTaken });
      return;
    }
    const body = assessmentUpdateBody(assessment, input, isActive);
    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }
    if (intervalChangeNeedsConfirm(assessment, input)) {
      setWaiting(body);
      return;
    }
    send(body);
  };

  const confirm = waiting && {
    ...confirmCopy({ repeat: true, better: false }),
    pending: update.isPending,
    onCancel: () => setWaiting(null),
    onConfirm: () => send(waiting),
  };

  return (
    <SetupSheet
      open={open}
      onOpenChange={onOpenChange}
      title={assessment ? text.editTitle : text.addTitle}
      formId={formId}
      saving={saving}
      confirm={confirm}
      wide
    >
      <form id={formId} noValidate onSubmit={form.handleSubmit(onValid, focusFirst)}>
        <FormGrid maxCols={2}>
          <TextField control={form.control} name="name" label={text.name} required />
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
            <NumberField
              control={form.control}
              name="intervalCount"
              label={text.repeatEvery}
              required
            />
            <ChipsField
              control={form.control}
              name="intervalUnit"
              legend={text.weeksOrMonths}
              hideLegend
              options={UNIT_OPTIONS}
              className="min-h-0 pt-0"
            />
          </div>
          {assessment && (
            <SwitchField
              control={form.control}
              name="isActive"
              label={text.on}
              hint={text.onHint}
            />
          )}
        </FormGrid>
      </form>
    </SetupSheet>
  );
}
