'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { focusFirstProblem } from '@/components/pages/members/focusFirstProblem';
import MembershipFields from '@/components/pages/members/MembershipFields';
import MoreDetailsFields from '@/components/pages/members/MoreDetailsFields';
import { asMemberControl, asPeriodControl } from '@/components/pages/members/memberFormControl';
import PersonFields from '@/components/pages/members/PersonFields';
import { useCreateMember } from '@/lib/api/members/queries';
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

// S6 Add member (BR-REC-03, 05, 45-50): one column; checked when a field is left and on Save; Save stays
// tappable and jumps to the first problem; no Reset (BR-REC-134). Draw it only in the browser: its defaults
// ("Joined on = today") are the device's day (see AfterHydration).
export default function AddMemberForm({ formId }: AddMemberFormProps) {
  const router = useRouter();
  const today = useToday();
  const schema = useMemo(() => memberFormSchema(today), [today]);
  const form = useForm<MemberFormInput, unknown, MemberFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    shouldFocusError: false, // focusFirstProblem also handles chips and the closed "More details"
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
        onSuccess: (member) => router.push(`/admin/members/${member.id}`),
        onError: (err) => {
          inFlight.current = false;
          const problem = serverFieldError(err, 'create');
          if (!problem) return;
          form.setError(problem.field, { message: problem.message });
          focusFirstProblem(formId, { [problem.field]: true });
        },
      },
    );
  };

  // "Joined on" first sets "Starts on" too, until "Starts on" has been changed on its own (BR-REC-50).
  const followJoinDate = (joinedOn: string) => {
    if (!startOnChangedByHand.current) form.setValue('startOn', joinedOn);
    void form.trigger('startOn');
  };

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onSubmit, (errors) => focusFirstProblem(formId, errors))}
      className="flex flex-col gap-4"
    >
      <PersonFields
        formId={formId}
        control={asMemberControl(form.control)}
        today={today}
        onJoinedOnChange={followJoinDate}
      />
      <MembershipFields
        formId={formId}
        control={asPeriodControl(form.control)}
        onStartOnChange={() => {
          startOnChangedByHand.current = true;
        }}
      />
      <MoreDetailsFields formId={formId} control={asMemberControl(form.control)} />
    </form>
  );
}
