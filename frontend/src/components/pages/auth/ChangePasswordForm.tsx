'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  FloatingLabelInput,
  FormControl,
  FormField,
  FormGrid,
  FormItem,
  FormMessage,
  useFocusFirstProblem,
} from '@/components/common/form';
import Section from '@/components/common/Section';
import { FieldDescription } from '@/components/ui/field';
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

const PASSWORD_FORM_ORDER = ['currentPassword', 'newPassword'] as const;

// S17 "Change password" (BR-REC-02, 34): current password and a new one of at least 8 characters. A wrong
// current password is said next to its field. No Reset button (BR-REC-134). The submit button is in the
// page header / action bar, so this form has none of its own.
export default function ChangePasswordForm({ formId }: ChangePasswordFormProps) {
  const { mutate } = useChangePassword();
  const focusFirst = useFocusFirstProblem(PASSWORD_FORM_ORDER);
  const inFlight = useRef(false);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false,
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  const onSubmit = (values: ChangePasswordInput) => {
    // A second Enter can arrive before the header button turns off: one try, one request (BR-REC-28).
    if (inFlight.current) return;
    inFlight.current = true;
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
      onSettled: () => {
        inFlight.current = false;
      },
    });
  };

  return (
    <Section title="Change password">
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit(onSubmit, focusFirst)}
        className="flex flex-col gap-4"
      >
        <FormGrid maxCols={2}>
          <FormField
            control={form.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <FloatingLabelInput
                    {...field}
                    label="Current password"
                    required
                    type="password"
                    autoComplete="current-password"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="newPassword"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <FloatingLabelInput
                    {...field}
                    label="New password"
                    required
                    type="password"
                    autoComplete="new-password"
                  />
                </FormControl>
                <FormMessage />
                {!fieldState.error && (
                  <FieldDescription>{`At least ${PASSWORD_MIN_LENGTH} characters`}</FieldDescription>
                )}
              </FormItem>
            )}
          />
        </FormGrid>
      </form>
    </Section>
  );
}
