'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  FloatingLabelInput,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  useFocusFirstProblem,
} from '@/components/common/form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useLogin } from '@/lib/api/auth/queries';
import { loginErrorMessage, SIGN_IN_AGAIN_LINE } from '@/lib/auth/loginError';
import { safeNextPath } from '@/lib/auth/safeNextPath';
import { type LoginInput, loginSchema } from '@/lib/validators/auth';

interface LoginFormProps {
  /** The page the trainer asked for before Login (`?next=`); anything outside the app becomes Home. */
  next?: string;
  /** Login was opened because the sign-in ended or a refresh failed (`?reason=expired`, BR-REC-41). */
  expired?: boolean;
}

const LOGIN_ORDER = ['username', 'password'] as const;

// S1 (auth.md): username, password with Show/Hide, "Keep me signed in" ticked, one error line with its
// space always reserved, Sign in. There is no "create account" (BR-REC-25). The button is only off while
// the call runs: a locked login (BR-REC-29) keeps it tappable and the line says how long to wait.
export default function LoginForm({ next, expired = false }: LoginFormProps) {
  const router = useRouter();
  const id = useId();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const focusFirst = useFocusFirstProblem(LOGIN_ORDER);
  const { mutate, isPending, isSuccess } = useLogin();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onBlur',
    shouldFocusError: false,
    defaultValues: { username: '', password: '', remember: true },
  });

  // "Please sign in again." is set after mount: text already in the server's HTML is not read out when
  // the page opens, text added to a live region is (BR-REC-137). It stays until the first try (BR-REC-41).
  useEffect(() => {
    if (expired) setNotice(SIGN_IN_AGAIN_LINE);
  }, [expired]);

  const onSubmit = (values: LoginInput) => {
    // A second Enter can arrive before the button turns off: one try, one request (BR-REC-28, 38).
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setNotice(null);
    mutate(values, {
      onSuccess: () => router.replace(safeNextPath(next) as Route),
      onError: (err) => {
        inFlight.current = false;
        setError(loginErrorMessage(err));
      },
    });
  };

  const busy = isPending || isSuccess; // stays off after success until the next page replaces this one

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(onSubmit, focusFirst)}
      className="flex flex-col gap-2"
    >
      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <FloatingLabelInput
                {...field}
                label="Username"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <div className="relative">
              <FormControl>
                <FloatingLabelInput
                  {...field}
                  id={`${id}-password`}
                  label="Password"
                  required
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="pr-20"
                />
              </FormControl>
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
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="remember"
        render={({ field }) => (
          <FormItem className="min-h-11">
            <div className="flex items-center gap-3">
              <FormControl>
                <Checkbox
                  id={`${id}-remember`}
                  name={field.name}
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked)}
                />
              </FormControl>
              <Label htmlFor={`${id}-remember`} className="text-base font-normal">
                Keep me signed in
              </Label>
            </div>
          </FormItem>
        )}
      />

      {/* One line for the server's answer (red), "Please sign in again." after an ended sign-in (BR-REC-41).
          Its space is always kept (two lines) and both regions are always in the page, only their text
          changes, so a screen reader announces it (BR-REC-137). */}
      <div className="min-h-12 text-base">
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <p role="status">{notice}</p>
      </div>

      <Button type="submit" size="lg" disabled={busy} className="w-full">
        {busy && <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className="animate-spin" />}
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
