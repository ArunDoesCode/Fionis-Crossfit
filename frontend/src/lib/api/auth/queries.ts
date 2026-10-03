import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import { changePasswordErrorMessage } from '@/lib/auth/loginError';
import { signOutAllDevices, signOutDevice } from '@/lib/auth/signOut';
import { messageForCode } from '@/lib/messages/errors';
import { changePassword, getMe, login } from './fetchers';

export const authKeys = {
  all: () => ['auth'] as const,
  me: () => [...authKeys.all(), 'me'] as const,
  changePassword: () => [...authKeys.all(), 'change-password'] as const,
};

export const authQueries = {
  me: () => queryOptions({ queryKey: authKeys.me(), queryFn: getMe }),
};

/** The signed-in account (E05): "Signed in as <username>". */
export const useMe = () => useQuery(authQueries.me());

/** E01. No toast: Login shows its own error line (BR-REC-01, 29). */
export const useLogin = () => useMutation({ mutationFn: login });

/**
 * E06. A wrong current password is shown next to its field by the form; a 401 is the global handler's
 * (it opens Login); everything else is a short toast (BR-REC-128).
 */
export function useChangePassword() {
  return useMutation({
    mutationKey: authKeys.changePassword(),
    mutationFn: changePassword,
    onSuccess: () => {
      toast.success('Password changed, and other devices are signed out.');
    },
    onError: (err) => {
      if (isApiError(err) && (err.status === 401 || err.code === 'CURRENT_PASSWORD_WRONG')) return;
      toast.error(changePasswordErrorMessage(err));
    },
  });
}

// A 401 here is the global handler's: it opens Login, which is where this was going anyway.
function signOutFailed(err: unknown) {
  if (isApiError(err) && err.status === 401) return;
  toast.error(
    isApiError(err)
      ? messageForCode(err.code)
      : "Couldn't sign out. Check your connection and try again.",
  );
}

/** E03: ends this device's sign-in, clears the cache, opens Login (BR-REC-35). */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => signOutDevice(queryClient), onError: signOutFailed });
}

/** E04: ends every sign-in, this one too (BR-REC-35). */
export function useSignOutAll() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: () => signOutAllDevices(queryClient), onError: signOutFailed });
}
