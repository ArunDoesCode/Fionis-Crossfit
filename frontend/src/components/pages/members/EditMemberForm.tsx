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
import MoreDetailsFields from '@/components/pages/members/MoreDetailsFields';
import PersonFields from '@/components/pages/members/PersonFields';
import UnsavedChangesSheet from '@/components/pages/members/UnsavedChangesSheet';
import { useUpdateMember } from '@/lib/api/members/queries';
import { useLeaveGuard } from '@/lib/assessments/useLeaveGuard';
import { changedMemberFields } from '@/lib/members/changes';
import { MEMBER_FIELD_LABELS, MEMBER_FORM_ORDER } from '@/lib/members/formFields';
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

// S8 Edit member (BR-REC-03, 45-49, 58, 189, 190): the S6 form without the membership fields, prefilled. Works
// for archived members too, and saving never changes whether they are archived. Only changed fields are
// sent; Save with no change sends nothing and goes back to the member without a word.
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
  const memberPage = `/admin/members/${member.id}` as const;
  const focusFirst = useFocusFirstProblem(MEMBER_FORM_ORDER);
  const guard = useLeaveGuard(form.formState.isDirty, memberPage);
  const { mutate } = useUpdateMember(member.id);
  const inFlight = useRef(false);

  const onSubmit = (values: MemberEditFormValues) => {
    if (inFlight.current) return;
    const changes = changedMemberFields(values, member);
    const toMember = () => router.push(memberPage);
    if (Object.keys(changes).length === 0) {
      guard.exitTo(toMember); // nothing to save: no request, no toast
      return;
    }
    inFlight.current = true;
    mutate(changes, {
      onSuccess: () => guard.exitTo(toMember),
      onError: (err) => {
        inFlight.current = false;
        const problem = serverFieldError(err, 'update');
        if (!problem) return;
        form.setError(problem.field, { message: problem.message });
        focusField(problem.field);
      },
    });
  };

  const hasMoreDetails = Boolean(member.email || member.objective || member.notes);

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
        <PersonFields control={form.control} today={today} selfId={member.id} />
        <MoreDetailsFields control={form.control} defaultOpen={hasMoreDetails} />
      </FormGrid>
      <UnsavedChangesSheet open={guard.open} onStay={guard.stay} onLeave={guard.leave} />
    </form>
  );
}
