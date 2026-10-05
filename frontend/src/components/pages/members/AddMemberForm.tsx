'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  FormErrorSummary,
  FormGrid,
  focusField,
  useFocusFirstProblem,
} from '@/components/common/form';
import MembershipFields from '@/components/pages/members/MembershipFields';
import MoreDetailsFields from '@/components/pages/members/MoreDetailsFields';
import { asMemberControl, asPeriodControl } from '@/components/pages/members/memberFormControl';
import PersonFields from '@/components/pages/members/PersonFields';
import UnsavedChangesSheet from '@/components/pages/members/UnsavedChangesSheet';
import { useCreateMember } from '@/lib/api/members/queries';
import { useLeaveGuard } from '@/lib/assessments/useLeaveGuard';
import { MEMBER_FIELD_LABELS, MEMBER_FORM_ORDER } from '@/lib/members/formFields';
import { newIdempotencyKey } from '@/lib/members/idempotencyKey';
import { serverFieldError } from '@/lib/members/serverErrors';
import { useToday } from '@/lib/members/useToday';
import {
  type MemberFormInput,
  type MemberFormValues,
  memberFormSchema,
} from '@/lib/validators/members';

interface AddMemberFormProps {
  /** The page header's "Add member" button submits this form (BR-REC-121: the one main action). */
  formId: string;
}

const MEMBERS_LIST = '/admin/members';

// S6 Add member (BR-REC-03, 05, 45-50, 189): two columns on a wide form; each field is checked when it is
// left and on Save; Save stays tappable and jumps to the first problem; no Reset; leaving with typing that
// is not saved asks first (#49). Draw it only in the browser: its defaults ("Joined on = today") are the
// device's day (see AfterHydration).
export default function AddMemberForm({ formId }: AddMemberFormProps) {
  const router = useRouter();
  const today = useToday();
  const schema = useMemo(() => memberFormSchema(today), [today]);
  const form = useForm<MemberFormInput, unknown, MemberFormValues>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false, // useFocusFirstProblem also handles chips and the closed "More details"
    defaultValues: {
      fullName: '',
      phone: '',
      dateOfBirth: '',
      sex: '',
      joinedOn: today,
      plan: '', // no default plan: the trainer picks one (BR-REC-50)
      startOn: today,
      email: '',
      objective: '',
      notes: '',
    },
  });
  const focusFirst = useFocusFirstProblem(MEMBER_FORM_ORDER);
  const guard = useLeaveGuard(form.formState.isDirty, MEMBERS_LIST);
  const { mutate } = useCreateMember();
  const inFlight = useRef(false);
  const startOnChangedByHand = useRef(false);
  // The key of the submit that is (or was) on its way. Tapping Save again with the same details after
  // a lost answer reuses it, so the server answers with the first member instead of adding a second
  // (BR-REC-156); changed details get a new key (the same key with another body is refused).
  const attempt = useRef<{ key: string; body: string } | null>(null);

  const onSubmit = (body: MemberFormValues) => {
    // A second tap can arrive before the button turns off: one try, one request.
    if (inFlight.current) return;
    const json = JSON.stringify(body);
    if (attempt.current?.body !== json) attempt.current = { key: newIdempotencyKey(), body: json };
    inFlight.current = true;
    mutate(
      { body, idempotencyKey: attempt.current.key },
      {
        // inFlight stays set: the page is about to be replaced by the new member's page.
        onSuccess: (member) => guard.exitTo(() => router.push(`/admin/members/${member.id}`)),
        onError: (err) => {
          inFlight.current = false;
          const problem = serverFieldError(err, 'create');
          if (!problem) return;
          form.setError(problem.field, { message: problem.message });
          focusField(problem.field);
        },
      },
    );
  };

  // "Joined on" first sets "Starts on" too, until "Starts on" has been changed on its own (BR-REC-50, 232). Typed
  // text that is not a day (an empty "Joined on") leaves "Starts on" as it was: that field asks on Save.
  const followJoinDate = (joinedOn: string) => {
    if (joinedOn !== '' && !startOnChangedByHand.current) form.setValue('startOn', joinedOn);
  };

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onSubmit, focusFirst)}
      className="flex flex-col gap-4"
    >
      {form.formState.submitCount > 0 && (
        <FormErrorSummary
          errors={form.formState.errors}
          order={MEMBER_FORM_ORDER}
          labels={MEMBER_FIELD_LABELS}
        />
      )}
      <FormGrid maxCols={2}>
        <PersonFields
          control={asMemberControl(form.control)}
          today={today}
          onJoinedOnChange={followJoinDate}
        />
        <MembershipFields
          control={asPeriodControl(form.control)}
          onStartOnChange={() => {
            startOnChangedByHand.current = true;
          }}
        />
        <MoreDetailsFields control={asMemberControl(form.control)} />
      </FormGrid>
      <UnsavedChangesSheet open={guard.open} onStay={guard.stay} onLeave={guard.leave} />
    </form>
  );
}
