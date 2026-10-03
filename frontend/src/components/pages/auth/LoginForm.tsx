'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useLogin } from '@/lib/api/auth/queries';
import { loginErrorMessage, SIGN_IN_AGAIN_LINE } from '@/lib/auth/loginError';
import { safeNextPath } from '@/lib/auth/safeNextPath';
import { cn } from '@/lib/utils';
import { type LoginInput, loginSchema } from '@/lib/validators/auth';

interface LoginFormProps {
  /** The page the trainer asked for before Login (`?next=`); anything outside the app becomes Home. */
  next?: string;
  /** Login was opened because the sign-in ended or a refresh failed (`?reason=expired`, BR-REC-41). */
  expired?: boolean;
}

// S1 (auth.md): username, password with Show/Hide, "Keep me signed in" ticked, one error line with its
// space always reserved, Sign in. There is no "create account" (BR-REC-25). The button is only off while
// the call runs: a locked login (BR-REC-29) keeps it tappable and the line says how long to wait.
export default function LoginForm({ next, expired = false }: LoginFormProps) {
  const router = useRouter();
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate, isPending, isSuccess } = useLogin();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    defaultValues: { username: '', password: '', remember: true },
  });

  const onSubmit = (values: LoginInput) => {
    setError(null);
    mutate(values, {
      onSuccess: () => router.replace(safeNextPath(next) as Route),
      onError: (err) => setError(loginErrorMessage(err)),
    });
  };

  const busy = isPending || isSuccess; // stays off after success until the next page replaces this one
  const line = error ?? (expired ? SIGN_IN_AGAIN_LINE : null);

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Controller
        control={form.control}
        name="username"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-username`}>Username</FieldLabel>
            <Input
              {...field}
              id={`${id}-username`}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
        name="password"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor={`${id}-password`}>Password</FieldLabel>
            <div className="relative">
              <Input
                {...field}
                id={`${id}-password`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={fieldState.invalid}
                className="pr-20"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-controls={`${id}-password`}
                className="absolute top-1/2 right-1 h-11 -translate-y-1/2 px-3 text-base"
                onClick={() => setShowPassword((shown) => !shown)}
              >
                {showPassword ? 'Hide' : 'Show'}
                <span className="sr-only"> password</span>
              </Button>
            </div>
            <div className="min-h-5">
              <FieldError errors={[fieldState.error]} />
            </div>
          </Field>
        )}
      />

      <Controller
        control={form.control}
        name="remember"
        render={({ field }) => (
          <Field orientation="horizontal" className="min-h-11">
            <Checkbox
              id={`${id}-remember`}
              name={field.name}
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked)}
            />
            <FieldLabel htmlFor={`${id}-remember`} className="text-base font-normal">
              Keep me signed in
            </FieldLabel>
          </Field>
        )}
      />

      {/* One line for what the server said; its space is always kept so nothing jumps (two lines). */}
      <p role="alert" className={cn('min-h-12 text-base', error && 'text-destructive')}>
        {line}
      </p>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
