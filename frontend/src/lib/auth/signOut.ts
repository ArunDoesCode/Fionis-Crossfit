import type { QueryClient } from '@tanstack/react-query';
import { logout, logoutAll } from '@/lib/api/auth/fetchers';
import { LOGIN_PATH } from '@/lib/auth/loginUrl';

// BR-REC-35: the server ends the sign-in and clears the cookies; then the app's cached data goes and the
// browser opens Login (a full navigation, so nothing from the old page stays in memory). When the call
// fails nothing is cleared and the error is thrown, so the screen can say it and stay signed in.
async function endSignIn(queryClient: QueryClient, end: () => Promise<unknown>): Promise<void> {
  await end();
  queryClient.clear();
  window.location.assign(LOGIN_PATH);
}

/** "Sign out": ends this device's sign-in (E03). */
export const signOutDevice = (queryClient: QueryClient): Promise<void> =>
  endSignIn(queryClient, logout);

/** "Sign out all devices": ends every sign-in, this one too (E04). */
export const signOutAllDevices = (queryClient: QueryClient): Promise<void> =>
  endSignIn(queryClient, logoutAll);
