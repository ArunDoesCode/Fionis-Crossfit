'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import Section from '@/components/common/Section';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useChangePassword } from '@/lib/api/auth/queries';
import { isApiError } from '@/lib/api/errors';
import { CURRENT_PASSWORD_WRONG_LINE } from '@/lib/auth/loginError';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
} from '@/lib/validators/auth';

interface ChangePasswordFormProps {
  /** The page header's "Change password" button submits this form (BR-REC-121: the one main action). */
  formId: string;
}

// S17 "Change password" (BR-REC-02, 34): current password and a new one of at least 8 characters. A wrong
// current password is said next to its field. No Reset button (BR-REC-134). The submit button is in the
// page header / action bar, so this form has none of its own.
export default function ChangePasswordForm({ formId }: ChangePasswordFormProps) {
  const { mutate } = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onBlur',
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = (values: ChangePasswordInput) =>
    mutate(values, {
      onSuccess: () => form.reset(),
      onError: (err) => {
        if (isApiError(err) && err.code === 'CURRENT_PASSWORD_WRONG') {
          form.setError(
            'currentPassword',
            { message: CURRENT_PASSWORD_WRONG_LINE },
            { shouldFocus: true },
          );
        }
      },
    });

  return (
    <Section title="Change password">
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        <Controller
          control={form.control}
          name="currentPassword"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-current`}>Current password</FieldLabel>
              <Input
                {...field}
                id={`${formId}-current`}
                type="password"
                autoComplete="current-password"
                aria-invalid={fieldState.invalid}
              />
              <div className="min-h-5">
                <FieldError errors={[fieldState.error]} />
              </div>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="newPassword"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-new`}>New password</FieldLabel>
              <Input
                {...field}
                id={`${formId}-new`}
                type="password"
                autoComplete="new-password"
                aria-invalid={fieldState.invalid}
                aria-describedby={`${formId}-new-hint`}
              />
              <FieldDescription id={`${formId}-new-hint`}>
                {`At least ${PASSWORD_MIN_LENGTH} characters`}
              </FieldDescription>
              <div className="min-h-5">
                <FieldError errors={[fieldState.error]} />
              </div>
            </Field>
          )}
        />
      </form>
    </Section>
  );
}
