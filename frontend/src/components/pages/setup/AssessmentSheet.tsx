'use client';

import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import ConfirmSheet from '@/components/common/ConfirmSheet';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import {
  ChipsControl,
  NumberControl,
  SwitchControl,
  TextControl,
} from '@/components/pages/setup/FormControls';
import { focusFirstProblem } from '@/components/pages/setup/focusFirstProblem';
import SheetBody from '@/components/pages/setup/SheetBody';
import SheetFooter from '@/components/pages/setup/SheetFooter';
import { isApiError } from '@/lib/api/errors';
import type { AssessmentType, UpdateAssessmentTypeBody } from '@/lib/api/setup/fetchers';
import { useCreateAssessmentType, useUpdateAssessmentType } from '@/lib/api/setup/queries';
import { messageForCode } from '@/lib/messages/errors';
import { confirmCopy, intervalChangeNeedsConfirm } from '@/lib/setup/describe';
import {
  type AssessmentFormValues,
  assessmentToInput,
  assessmentToValues,
  assessmentUpdateBody,
  newAssessmentValues,
  parseAssessment,
  schemaResolver,
} from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { assessmentFormSchema } from '@/lib/validators/setup';

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

// Add / edit an assessment (BR-REC-13, 61, 66, 70): name, repeat number + unit, and (when editing) the On
// switch. A changed repeat asks "This changes due dates for all members" first (BR-REC-70, 133). A name
// that is already used is said next to the Name field (BR-REC-61); every other server answer is a toast
// from the mutation hook. Bottom sheet on phones, dialog on desktop (BR-REC-138).
export default function AssessmentSheet({ assessment, open, onOpenChange }: AssessmentSheetProps) {
  const formId = useId();
  const ids = {
    name: `${formId}-name`,
    intervalCount: `${formId}-count`,
    isActive: `${formId}-on`,
  };
  const create = useCreateAssessmentType();
  const update = useUpdateAssessmentType();
  // The changes waiting for the repeat confirmation; `null` when no question is open.
  const [waiting, setWaiting] = useState<UpdateAssessmentTypeBody | null>(null);
  const form = useForm<AssessmentFormValues>({
    resolver: schemaResolver(assessmentFormSchema, assessmentToInput),
    mode: 'onBlur',
    shouldFocusError: false,
    defaultValues: assessment ? assessmentToValues(assessment) : newAssessmentValues(),
  });
  const saving = create.isPending || update.isPending;

  const showNameTaken = (err: unknown) => {
    if (isApiError(err) && err.code === 'NAME_TAKEN') {
      form.setError('name', { message: messageForCode(err.code) });
      document.getElementById(ids.name)?.focus();
    }
  };

  const send = (body: UpdateAssessmentTypeBody) => {
    if (!assessment) return;
    update.mutate(
      { typeId: assessment.id, body },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => {
          setWaiting(null);
          showNameTaken(err);
        },
      },
    );
  };

  const onValid = (values: AssessmentFormValues) => {
    // A second Enter can arrive before Save turns off: one try, one request.
    if (saving) return;
    const input = parseAssessment(values);
    if (!assessment) {
      create.mutate(input, { onSuccess: () => onOpenChange(false), onError: showNameTaken });
      return;
    }
    const body = assessmentUpdateBody(assessment, input, form.getValues('isActive'));
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

  const copy = confirmCopy({ repeat: true, better: false });

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={assessment ? text.editTitle : text.addTitle}
      footer={<SheetFooter formId={formId} saving={saving} onCancel={() => onOpenChange(false)} />}
    >
      <SheetBody>
        <form
          id={formId}
          noValidate
          onSubmit={form.handleSubmit(onValid, (errors) =>
            focusFirstProblem(errors, FIELD_ORDER, ids),
          )}
          className="flex flex-col gap-2"
        >
          <TextControl
            control={form.control}
            name="name"
            id={ids.name}
            label={text.name}
            required
          />
          <div className="flex flex-col gap-2">
            <NumberControl
              control={form.control}
              name="intervalCount"
              id={ids.intervalCount}
              label={text.repeatEvery}
              required
            />
            <ChipsControl
              control={form.control}
              name="intervalUnit"
              legend={text.weeksOrMonths}
              hideLegend
              options={UNIT_OPTIONS}
            />
          </div>
          {assessment && (
            <SwitchControl
              control={form.control}
              name="isActive"
              id={ids.isActive}
              label={text.on}
              hint={text.onHint}
            />
          )}
        </form>
      </SheetBody>
      <ConfirmSheet
        open={waiting !== null}
        onOpenChange={(next) => {
          if (!next) setWaiting(null);
        }}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        pending={update.isPending}
        onConfirm={() => waiting && send(waiting)}
      />
    </ResponsiveSheet>
  );
}
