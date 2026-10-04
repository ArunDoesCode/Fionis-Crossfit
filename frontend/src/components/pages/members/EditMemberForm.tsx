'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { focusFirstProblem } from '@/components/pages/members/focusFirstProblem';
import MoreDetailsFields from '@/components/pages/members/MoreDetailsFields';
import PersonFields from '@/components/pages/members/PersonFields';
import { useUpdateMember } from '@/lib/api/members/queries';
import { changedMemberFields } from '@/lib/members/changes';
import { serverFieldError } from '@/lib/members/serverErrors';
import type { MemberDetail } from '@/lib/members/types';
import { useToday } from '@/lib/members/useToday';
import {
  type MemberEditFormInput,
  type MemberEditFormValues,
  memberEditFormSchema,
} from '@/lib/validators/members';

interface EditMemberFormProps {
  formId: string;
  /** The member as loaded; the form starts from it and is not reset by later refreshes (edits are kept). */
  member: MemberDetail;
}

// S8 Edit member (BR-REC-03, 45-49, 58): the S6 form without the membership fields, prefilled. Works for
// archived members too, and saving never changes whether they are archived. Only changed fields are sent.
export default function EditMemberForm({ formId, member }: EditMemberFormProps) {
  const router = useRouter();
  const today = useToday();
  const schema = useMemo(() => memberEditFormSchema(today), [today]);
  const form = useForm<MemberEditFormInput, unknown, MemberEditFormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    shouldFocusError: false,
    defaultValues: {
      fullName: member.fullName,
      phone: member.phone,
      dateOfBirth: member.dateOfBirth,
      sex: member.sex,
      joinedOn: member.joinedOn,
      email: member.email ?? '',
      objective: member.objective ?? '',
      notes: member.notes ?? '',
    },
  });
  const { mutate } = useUpdateMember(member.id);
  const inFlight = useRef(false);
  const memberPage = `/admin/members/${member.id}` as const;

  const onSubmit = (values: MemberEditFormValues) => {
    if (inFlight.current) return;
    const changes = changedMemberFields(values, member);
    // Nothing changed: nothing to save, back to the member.
    if (Object.keys(changes).length === 0) {
      router.push(memberPage);
      return;
    }
    inFlight.current = true;
    mutate(changes, {
      onSuccess: () => router.push(memberPage),
      onError: (err) => {
        inFlight.current = false;
        const problem = serverFieldError(err, 'update');
        if (!problem) return;
        form.setError(problem.field, { message: problem.message });
        focusFirstProblem(formId, { [problem.field]: true });
      },
    });
  };

  const hasMoreDetails = Boolean(member.email || member.objective || member.notes);

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onSubmit, (errors) => focusFirstProblem(formId, errors))}
      className="flex flex-col gap-4"
    >
      <PersonFields formId={formId} control={form.control} today={today} selfId={member.id} />
      <MoreDetailsFields formId={formId} control={form.control} defaultOpen={hasMoreDetails} />
    </form>
  );
}
