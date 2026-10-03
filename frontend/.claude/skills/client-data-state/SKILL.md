---
name: client-data-state
description: "Use when writing fetchers, TanStack Query keys/queryOptions/hooks, mutations, nuqs URL state, Zustand UI stores, or hydration for the external-api archetype in frontend/. Triggers: data fetch, mutation, useQuery, useMutation, query key, invalidation, prefetch, HydrationBoundary, nuqs, zustand, store, realtime invalidation, SSE."
---

# Client data and state (frontend/)

Full rules: `docs/standards/nextjs-standards.md` §5, §6, §10–§13, §16. Summary for this repo:

## Data path (one path per direction)
`API_ROUTES` (lib/api/routes.ts) → `fetchers.ts` (via `api.*` from `lib/api/client.ts`, throws `ApiError`) →
`queries.ts` (key factory, `queryOptions`, `useQuery`/`useMutation` hooks) → views. Server Components use
`serverApi` (forwards the cookie) and `prefetchQuery` + `dehydrate` + `HydrationBoundary`; `staleTime > 0`.

## Rules
- Keys: `[feature]Keys` factory; invalidate by factory (`jobKeys.lists()`), never literal arrays.
- `queryOptions()` is the single source of key + fn (hooks, prefetch, `getQueryData`, `setQueryData`).
- Mutation hooks own toasts; components pass UI callbacks via `mutate(data, { onSuccess })`. Branch on
  `result.success` where the API returns 200 with `{ success:false }`. Invalidate **every** affected key.
- `isLoading` first load · `isPending` mutations · `isFetching` background.
- nuqs: parsers once in `lib/searchParams.ts`; client owns data (default) → `shallow: true`, filters in the key;
  debounce text with `limitUrlUpdates: debounce(300)`; reset `offset`/`page` in the same `setParams` call.
- Zustand: UI state only, ids not objects, store factory + provider (no module singletons in SSR), atomic
  selectors/`useShallow`, `devtools` dev-only, always a `reset`/`close` action.
- Never sync Zustand ⇄ TanStack Query or Zustand ⇄ URL.

## Live updates
- Admin: poll (`refetchInterval`, paused when hidden) or SSE → `invalidateQueries` (throttled ~1 s).
- TV: see skill `tv-rendering` (events carry full records → `setQueryData`; transient items → Zustand).

## Types
Request/response types come from `src/types/api.generated.ts` (generated from the backend OpenAPI; run
`bun run types:api`). Form schemas in `lib/validators/` mirror the backend's; the backend re-validates.
