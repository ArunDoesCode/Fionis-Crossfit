'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormGrid, focusField, useFocusFirstProblem } from '@/components/common/form';
import MembershipFields from '@/components/pages/members/MembershipFields';
import {
  asPeriodControl,
  type PeriodFormControl,
} from '@/components/pages/members/memberFormControl';
import { type PeriodJob, useSavePeriod } from '@/lib/api/members/queries';
import type { IsoDate } from '@/lib/domain/dates';
import { changedPeriodFields } from '@/lib/members/changes';
import { MEMBER_FORM_ORDER } from '@/lib/members/formFields';
import { newIdempotencyKey } from '@/lib/members/idempotencyKey';
import { entryEnd, renewDefaults, renewRestoresMember } from '@/lib/members/renew';
import { periodFieldError } from '@/lib/members/serverErrors';
import type { MemberDetail, MemberPeriod } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';
import {
  type PeriodFormInput,
  type PeriodFormValues,
  periodFormSchema,
} from '@/lib/validators/members';

// BR-REC-58 (Q7 = B): saving a membership that covers today brings an archived member back to the list.
// The sheet says so before the trainer taps Renew; an old binder entry (all in the past) or a later start
// never does, and then the line is not shown. It is only drawn for an archived member. `verb` is
// "Renewing" on the Renew sheet, "Saving" on Edit membership.
function RestoreNote({
  control,
  fullName,
  today,
  verb,
}: {
  control: PeriodFormControl;
  fullName: string;
  today: IsoDate;
  verb: 'Renewing' | 'Saving';
}) {
  const [plan, startOn] = useWatch({ control, name: ['plan', 'startOn'] });
  const end = entryEnd(plan, startOn);
  const restores = end !== null && renewRestoresMember(true, { startOn, endOn: end }, today);

  return (
    <p aria-live="polite" className="col-span-full min-h-6 text-base font-medium">
      {restores && `${verb} brings ${fullName} back to the list.`}
    </p>
  );
}

interface PeriodFormProps {
  /** The sheet's footer button submits this form. */
  formId: string;
  member: MemberDetail;
  /** The period being edited; none = Renew. */
  period?: MemberPeriod;
  /** The save went through (or there was nothing to save): the sheet closes. */
  onDone: () => void;
}

// S9 Renew / Edit membership (BR-REC-09, 54, 55, 58): plan chips, "Starts on", the live "Ends …" line. Renew
// starts from the last plan and the day after the last end; Edit starts from that period. Both stay
// changeable. The form starts from the member as loaded and is not reset by later refreshes. No question
// before saving (BR-REC-133). The sheet is drawn only while open, so every opening starts fresh.
export default function PeriodForm({ formId, member, period, onDone }: PeriodFormProps) {
  const today = useToday();
  const form = useForm<PeriodFormInput, unknown, PeriodFormValues>({
    resolver: zodResolver(periodFormSchema),
    mode: 'onBlur',
    shouldFocusError: false,
    defaultValues: period
      ? { plan: period.plan, startOn: period.startOn }
      : renewDefaults(member.periods),
  });
  const focusFirst = useFocusFirstProblem(MEMBER_FORM_ORDER);
  const { mutate } = useSavePeriod(member);
  const inFlight = useRef(false);
  // Same rule as Add member (BR-REC-156): tapping Renew again with the same details after a lost answer
  // reuses the key, so the server answers with the first period instead of adding a second; changed
  // details get a new key (the same key with another body is refused).
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const archived = member.archivedAt !== null;

  const jobFor = (values: PeriodFormValues): PeriodJob | null => {
    if (!period) {
      const json = JSON.stringify(values);
      if (attempt.current?.body !== json) {
        attempt.current = { key: newIdempotencyKey(), body: json };
      }
      return { kind: 'renew', body: values, idempotencyKey: attempt.current.key };
    }
    // Only what changed is sent (E23). The API refuses an empty change, so with no change there is
    // nothing to save, except that saving a period that covers today still brings an archived member back
    // (BR-REC-58): that one is sent whole.
    const changes = changedPeriodFields(values, period);
    if (Object.keys(changes).length > 0)
      return { kind: 'edit', periodId: period.id, body: changes };
    return renewRestoresMember(archived, period, today)
      ? { kind: 'edit', periodId: period.id, body: values }
      : null;
  };

  const onSubmit = (values: PeriodFormValues) => {
    // A second tap can arrive before the button turns off: one try, one request.
    if (inFlight.current) return;
    const job = jobFor(values);
    if (!job) {
      onDone();
      return;
    }
    inFlight.current = true;
    mutate(job, {
      // inFlight stays set: the sheet is about to close.
      onSuccess: onDone,
      onError: (err) => {
        inFlight.current = false;
        const problem = periodFieldError(err);
        if (!problem) return;
        form.setError(problem.field, { message: problem.message });
        focusField(problem.field);
      },
    });
  };

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onSubmit, focusFirst)}
      className="flex flex-col gap-4"
    >
      <FormGrid maxCols={2}>
        <MembershipFields control={asPeriodControl(form.control)} />
        {archived && (
          <RestoreNote
            control={asPeriodControl(form.control)}
            fullName={member.fullName}
            today={today}
            verb={period ? 'Saving' : 'Renewing'}
          />
        )}
      </FormGrid>
    </form>
  );
}
