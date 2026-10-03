import {
  defaultShouldDehydrateQuery,
  isServer,
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { isApiError } from '@/lib/api/errors';
import { LOGIN_PATH, loginPath } from '@/lib/auth/loginUrl';

// The one global 401 handler (BR-REC-41). A 401 that reaches a query or mutation has already been through
// the wrapper's one refresh, so the sign-in is over: open Login on the page the trainer was on. Browser
// navigation (not the router) so no state of the old session survives. Drafts live in the browser's own
// storage and stay. E01's wrong-password 401 is Login's own answer, and Login never redirects to itself.
function openLoginOnUnauthorized(error: unknown) {
  if (typeof window === 'undefined') return;
  if (!isApiError(error) || error.status !== 401 || error.code === 'INVALID_CREDENTIALS') return;
  const { pathname, search } = window.location;
  if (pathname === LOGIN_PATH) return;
  window.location.assign(loginPath({ next: `${pathname}${search}`, expired: true }));
}

function makeQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({ onError: openLoginOnUnauthorized }),
    mutationCache: new MutationCache({ onError: openLoginOnUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000, // > 0 so hydrated data isn't refetched immediately
        gcTime: 5 * 60_000,
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 1,
      },
      mutations: { retry: 0 },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending', // streaming
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// New client per request on the server (no cross-user leaks); singleton in the browser.
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
