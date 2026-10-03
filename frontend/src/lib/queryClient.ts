import { defaultShouldDehydrateQuery, isServer, QueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api/errors';

function makeQueryClient() {
  return new QueryClient({
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
