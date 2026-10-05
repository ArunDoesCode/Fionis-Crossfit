# Next.js Coding Standards (Agent Guide)

> **Audience:** AI coding agents and developers working in any of my Next.js apps.
> **Scope:** project-agnostic. Project-specific rules (domain, roles, device constraints) live in the project's own `CLAUDE.md` / `AGENTS.md` and **override** this file where they conflict.
> **Baseline (Sept 2026):** Next.js 16.3.x · React 19.x · TypeScript 5.x (strict) · Tailwind CSS 4 · Node 20.9+.

### How an agent uses this file

1. **Identify the project profile** (§1). Everything else branches on the *archetype*.
2. Read the **Hard Rules** (§2) — they apply to every archetype.
3. Use the **decision tables** (§3 rendering, §6 HTTP client, §11 state) before writing code.
4. Copy the **canonical patterns**; don't invent new shapes.
5. Run the **Pre-completion checklist** (§26) before finishing.
6. If a generated `AGENTS.md` from `next dev` exists, trust it for version-specific API details over your memory.

Keywords: **MUST / NEVER** = non-negotiable. **PREFER** = default unless the project documents a reason. **MAY** = allowed when needed.

---

## §0. Default Stack (my preferences)

| Concern           | Choice                                                             |
| ----------------- | ------------------------------------------------------------------ |
| Framework         | Next.js App Router (16.x conventions: `proxy.ts`, async request APIs, Turbopack) |
| Language          | TypeScript, `strict: true`, no `any`                               |
| Styling           | Tailwind CSS 4 (CSS-first `@theme` tokens)                         |
| Components        | shadcn/ui (primitives in `components/ui/`, never hand-edited)      |
| Server state      | TanStack Query v5                                                  |
| URL state         | nuqs v2 — *when the page has shareable filters/pagination/tabs*    |
| UI state          | Zustand v5 — *only when state is shared across distant components* |
| Forms             | React Hook Form + Zod v4 (`@hookform/resolvers`)                   |
| Validation        | Zod — schemas shared between client and server                     |
| Tables            | TanStack Table v9 (via shared `DataTable`)                         |
| Toasts            | Sonner                                                             |
| Icons             | `<HugeiconsIcon icon={…} />` (Hugeicons) only                      |
| Dates             | `date-fns` only                                                    |
| HTTP              | Per project — see §6 (native `fetch` wrapper / axios / both)       |
| Lint + format     | Biome (`biome check .`) — `next lint` no longer exists             |
| React Compiler    | PREFER `reactCompiler: true` on new apps (stable, opt-in)          |

---

## §1. Project Profile (determine first)

Every project's `CLAUDE.md` SHOULD declare this block. If missing, infer it from `package.json` / folder structure and state your assumption.

```yaml
nextjs-profile:
  archetype: supabase | external-api | fullstack | spa
  backend: none | supabase | hono | <other>        # external-api only
  http: fetch | axios | fetch-server+axios-client
  auth: supabase | jwt-cookie | none
  cacheComponents: true                              # default for new apps
  pwa: false | installable | offline-first
  device-profile: default | low-end | kiosk
```

### 1.1 Archetypes

| Archetype        | What it is                                                     | Reads (server)                                  | Reads (client)                        | Writes                                      | Server Actions? |
| ---------------- | -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------- | ------------------------------------------- | --------------- |
| **supabase**     | Next.js talks to Supabase directly (RLS is the security layer) | Supabase server client in RSC / DAL             | TanStack Query → Supabase browser client | Server Actions (via DAL) **or** browser client + RLS | YES (PREFER for writes needing secrets/side effects) |
| **external-api** | Dedicated backend (Hono, Nest, Go…) owns all logic             | Typed HTTP client in RSC (forward cookies)      | TanStack Query → HTTP client          | TanStack `useMutation` → HTTP client        | **NEVER** — it's an extra hop with no security benefit |
| **fullstack**    | Next.js *is* the backend (Drizzle ORM in-process, §7.3)                   | DAL functions directly in RSC (no HTTP to self) | TanStack Query → Route Handler GETs   | **Server Actions + DAL**                    | YES — default write path |
| **spa**          | Fully client-side (`output: 'export'` or CSR-only)             | n/a                                             | TanStack Query → HTTP client          | `useMutation` → HTTP client                 | NO (not available) |

**Rule of one path:** each codebase has exactly one data-access path per direction. Don't mix Server Actions and direct API calls for the same resource.

### 1.2 Where security lives (per archetype)

| Archetype    | Authoritative check                                      | `proxy.ts` role              |
| ------------ | -------------------------------------------------------- | ---------------------------- |
| supabase     | RLS policies + DAL `verifySession()` in actions          | Session refresh + optimistic redirect |
| external-api | Backend middleware (e.g. Hono `requireRole()`) + DB RLS  | Optimistic redirect only     |
| fullstack    | DAL `verifySession()` inside **every** action/handler/data fn | Optimistic redirect only |
| spa          | Backend only (client checks are UX, not security)        | n/a                          |

`proxy.ts` is **never** the only line of defense (it can be bypassed — see CVE-2025-29927). Layouts **never** gate auth (they don't re-render on navigation).

---

## §2. Hard Rules (all archetypes)

### Data
1. **MUST** use TanStack Query (`useQuery` / `useMutation`) for client-side server state. **NEVER** `useState` + `useEffect` to fetch or mirror server data.
2. **NEVER** call `fetch()` / `axios` directly inside components or hooks — go through the project's API layer (`lib/api/*`) or DAL.
3. **NEVER** hardcode endpoint strings — use `API_ROUTES` constants.
4. **NEVER** use Server Actions to *fetch* data (they run serially). Actions are for mutations.
5. **NEVER** make an HTTP call from a Server Component to your own Next.js `/api` — call the DAL/fetcher directly.
6. **NEVER** render the same query's data both in a Server Component and a Client Component — let one own it.
7. **NEVER** call `router.refresh()` after a client mutation — invalidate TanStack Query keys. (Server Actions use `updateTag` / `refresh()` from `next/cache`.)

### Components & rendering
8. `page.tsx` and `layout.tsx` are Server Components. `'use client'` is pushed to the **leaves**.
9. Every route segment with data **MUST** have `loading.tsx` (shape-matching skeleton) and `error.tsx` (`'use client'`).
10. **MUST** `await` `params`, `searchParams`, `cookies()`, `headers()` (sync access is removed in Next 16).
11. **MUST** use `next/image`, `next/font`, `next/link`, `next/script` — never raw `<img>`, `<link rel="font">`, or `<script>`.
12. **NEVER** edit `components/ui/*` or generated DB types by hand.

### Security
13. Secrets, DB clients, DAL modules **MUST** start with `import 'server-only'`.
14. **NEVER** expose a secret via `NEXT_PUBLIC_*` (those are inlined into the client bundle at build time).
15. Auth tokens live in **httpOnly cookies** — **NEVER** `localStorage` / `sessionStorage`.
16. Every Server Action and Route Handler **MUST** authenticate, authorize (ownership/IDOR), and Zod-validate its input.
17. **NEVER** commit `.env*.local`. Document every var in `.env.example`.

### Types
18. **NEVER** `any` (use `unknown` + narrowing). **NEVER** redefine DB types or Zod schemas — import them.

---

## §3. Rendering & Caching

### 3.1 Model: Cache Components (default for new apps)

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true, // dynamic by default, opt into caching with 'use cache'; PPR is built in
  reactCompiler: true,
  typedRoutes: true,
};

export default nextConfig;
```

Under `cacheComponents`:

- Everything is **dynamic by default**; nothing is cached implicitly.
- Cache with the `'use cache'` directive (file / component / function), plus `cacheLife(profile)` and `cacheTag(tag)`.
- Runtime data (`cookies()`, `headers()`, `searchParams`, `connection()`) **MUST** be read inside a `<Suspense>` boundary (or under a `loading.tsx`).
- **NEVER** read `cookies()` / `headers()` / `searchParams` inside a `'use cache'` scope — read outside, pass values as arguments.
- Route segment configs `dynamic`, `revalidate`, `fetchCache` **are errors** — don't write them.
- `generateStaticParams` must return **≥ 1** entry.
- `Date.now()`, `Math.random()`, `crypto.randomUUID()` in prerendered code → move behind `await connection()` in Suspense, or into a client component.
- Always set `cacheLife` explicitly in each cached scope.

### 3.2 Which strategy? (decision table)

| Page needs…                                                   | Strategy          | How (cacheComponents)                                                                 |
| ------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- |
| No runtime data (marketing, docs, legal)                      | **Static**        | Nothing to do — prerendered. Cached data fns: `'use cache'` + `cacheLife('max')`      |
| Shared data that changes occasionally (catalog, blog, lookups) | **ISR**          | `'use cache'` + `cacheLife('hours')` + `cacheTag('x')`; invalidate with `updateTag` (actions) / `revalidateTag('x', 'max')` (webhooks) |
| Static shell + per-user/per-request parts (dashboards, most app pages) | **PPR** (default) | Static layout/shell; dynamic parts inside `<Suspense>` with skeleton fallbacks |
| Entirely request-specific (auth-gated detail, search results) | **SSR**           | Read runtime data inside Suspense / under `loading.tsx`                                |
| Browser-only APIs, heavy interactivity, offline-first         | **CSR**           | Client component; heavy/browser-only pieces via `dynamic(() => import(…), { ssr: false })` **inside a client component** |
| No server at all                                              | **SPA / export**  | `output: 'export'` (no `'use cache'`, no Server Actions, no proxy)                     |

**Rules:**

- PREFER PPR: static shell renders instantly, dynamic holes stream.
- **NEVER** cache per-user or authenticated data in a shared cache. If you must cache user data, the user/org id is an explicit argument and the data is non-sensitive.
- `'use cache'` default storage is in-memory per instance (not shared across serverless instances/deploys). Use `'use cache: remote'` when the platform supports it and cross-instance hits matter.
- Nonce-based CSP forces dynamic rendering and **disables PPR/static** — prefer `experimental.sri` or a hash/strict-dynamic CSP without nonces on cached routes.
- Set real HTTP status (redirect/404/401) **before** streaming starts (proxy or top of page); once streaming, status is 200.

### 3.3 Invalidation cheat sheet

| API                          | Where                         | Semantics                                   |
| ---------------------------- | ----------------------------- | ------------------------------------------- |
| `updateTag(tag)`             | Server Actions only           | Expire now; read-your-own-writes            |
| `revalidateTag(tag, 'max')`  | Route Handlers, webhooks, actions | Stale-while-revalidate (2nd arg **required**) |
| `revalidatePath(path)`       | Actions / handlers            | Path-level, use sparingly                   |
| `refresh()` (`next/cache`)   | Server Actions only           | Re-render uncached data, cache untouched    |
| `queryClient.invalidateQueries` | Client                     | TanStack cache (client mutations)           |

### 3.4 Legacy model (existing apps without `cacheComponents`)

Don't migrate opportunistically — migrate deliberately. Mapping when you do:

| Legacy                                     | Cache Components equivalent                    |
| ------------------------------------------ | ---------------------------------------------- |
| `export const revalidate = 60`             | `'use cache'` + `cacheLife('minutes')`         |
| `export const dynamic = 'force-static'`    | `'use cache'` + `cacheLife('max')`             |
| `export const dynamic = 'force-dynamic'`   | Remove it (default)                            |
| `fetch(url, { next: { revalidate, tags } })` | `'use cache'` + `cacheLife` + `cacheTag`     |
| `unstable_cache`                           | `'use cache'`                                  |
| `unstable_noStore()`                       | `await connection()` inside Suspense           |
| `dynamicParams = false`                    | `notFound()` for unknown params                |
| `experimental.ppr`                         | Built in — delete the flag                     |

In the legacy model `fetch` is **not** cached by default (since v15) — opt in with `cache: 'force-cache'`.

### 3.5 Streaming & waterfalls

- PREFER granular `<Suspense>` around slow sections over one page-level `loading.tsx`.
- Independent fetches: `Promise.all`, never sequential `await`s.
- Wrap per-request shared fetchers (`getCurrentUser`, `verifySession`) in `React.cache()` so layout + page + `generateMetadata` dedupe.
- MAY pass an un-awaited promise from a Server Component to a Client Component and unwrap with `use()` inside `<Suspense>`.

---

## §4. Folder Structure

All app code under `src/`. Path alias `@/*` → `./src/*`.

```
src/
├── proxy.ts                        ← Next 16 route guard (replaces middleware.ts). Optimistic checks + session refresh only
├── instrumentation.ts              ← register() (OTel, env validation), onRequestError
├── instrumentation-client.ts       ← client-side init (analytics, error reporting)
├── app/
│   ├── layout.tsx                  ← <html>, fonts, <Providers>
│   ├── global-error.tsx            ← renders its own <html>/<body>
│   ├── not-found.tsx
│   ├── manifest.ts                 ← PWA manifest (if pwa ≠ false)
│   ├── (public)/                   ← marketing / static pages
│   ├── (auth)/
│   │   └── login/
│   │       ├── page.tsx            ← server component; redirect if already authed
│   │       └── loading.tsx
│   ├── (app)/                      ← authenticated area
│   │   ├── layout.tsx              ← the shell (sidebar/header) lives here and in `_components/` beside it; no `components/shells` folder — NO auth gating here
│   │   └── [feature]/
│   │       ├── page.tsx            ← thin server component → View
│   │       ├── loading.tsx         ← shape-matching skeleton (always)
│   │       ├── error.tsx           ← 'use client' (always)
│   │       └── [id]/page.tsx
│   └── api/                        ← Route Handlers: webhooks, client GETs (fullstack), or Hono mount
│       └── [[...route]]/route.ts   ← only if mounting Hono inside Next
│
├── components/
│   ├── ui/                         ← shadcn primitives — never edit
│   ├── common/                     ← reusable widgets (DataTable, TablePagination, SearchBar, ErrorComponent, EmptyState)
│   ├── pages/[feature]/            ← route-specific UI (FeatureForm, FeatureSearchbar, columns.tsx)
│   ├── views/[feature]/            ← 'use client' stateful containers rendered by page.tsx
│   └── [role]/                     ← role-specific components (optional)
│
├── lib/
│   ├── api/                        ← HTTP layer (external-api / spa / client GETs)
│   │   ├── client.ts               ← isomorphic HTTP client (fetch wrapper or axios instance)
│   │   ├── server.ts               ← 'server-only' client that forwards cookies
│   │   ├── errors.ts               ← ApiError
│   │   ├── routes.ts               ← API_ROUTES constants
│   │   └── [feature]/
│   │       ├── fetchers.ts         ← raw async fns (no hooks) — usable from RSC & queryFn
│   │       └── queries.ts          ← key factory + queryOptions + useQuery/useMutation hooks
│   ├── dal/                        ← 'server-only' data access layer (supabase / fullstack)
│   │   ├── session.ts              ← verifySession = cache(...)
│   │   └── [feature].ts            ← reads (+ 'use cache' where shared), return DTOs
│   ├── actions/[feature].ts        ← 'use server' mutations (supabase / fullstack)
│   ├── db/                         ← Drizzle (fullstack): index.ts (client) · schema/*.ts · relations.ts
│   ├── supabase/                   ← client.ts (browser) · server.ts · proxy.ts (session refresh)
│   ├── hooks/                      ← realtime/invalidation + other custom hooks (use[Name].ts)
│   ├── store/[feature]Store.ts     ← Zustand (UI state only)
│   ├── validators/                 ← Zod schemas (form + action/handler inputs)
│   ├── providers.tsx               ← QueryClientProvider + NuqsAdapter + Toaster (+ store providers)
│   ├── queryClient.ts              ← getQueryClient()
│   ├── searchParams.ts             ← nuqs parsers + caches/loaders (shared client/server)
│   ├── env.ts                      ← validated env (server + client split)
│   ├── messages/                   ← typed UI dictionaries per locale (multilingual apps, §22.1)
│   └── utils.ts                    ← cn() + small utilities
│
└── types/
    ├── api.ts                      ← ApiResponse<T>, ErrorResponse, PaginatedResponse<T>, ActionResult<T>
    ├── database.types.ts           ← generated by `supabase gen types` (supabase archetype) — never edit
    ├── api.generated.ts            ← generated from backend OpenAPI (external-api, optional) — never edit
    └── index.ts                    ← barrel re-exports (types only)
```

Only create the folders your archetype needs (e.g. no `lib/dal` in `external-api`, no `lib/api/server.ts` in `spa`).

Fullstack projects also have, at the repo root: `drizzle.config.ts` and `drizzle/` (generated SQL migrations, committed).

### 4.0 Repository layout (no monorepo)

- **No Turborepo / workspaces / shared `packages/*`.** Each app is its own standalone repo; all repos sit side by side in one parent folder (e.g. `~/codes/<project>`).
- A frontend and its backend (e.g. Next.js app + Hono API) are **separate repos**. Nothing is imported across repos — no relative `../other-repo` imports, no `file:` / `link:` dependencies.
- Contract between repos = the HTTP API:
  - **Backend is the source of truth** for validation; it re-validates every request.
  - Frontend keeps its own Zod schemas in `src/lib/validators/` (form UX), mirroring the backend's.
  - Response types: PREFER generating them from the backend's OpenAPI spec (Hono `@hono/zod-openapi` → `openapi-typescript` → `src/types/api.generated.ts`, re-run when the API changes). Otherwise hand-written in `src/types/`.
- When a contract changes, update both repos in the same task and note it in both `CLAUDE.md` changelogs/PRs.
- Each repo has its own `CLAUDE.md` with the §1 profile block and its own `.env.example`, Biome config, and lockfile.

### 4.1 Placement rules

| What                                 | Where                                   |
| ------------------------------------ | --------------------------------------- |
| shadcn primitives                    | `components/ui/` — never edit; wrap in `common/` to extend |
| Reusable widgets                     | `components/common/`                    |
| Route-specific UI                    | `components/pages/[feature]/`           |
| Stateful page containers             | `components/views/[feature]/`           |
| Endpoint paths                       | `lib/api/routes.ts`                     |
| Raw HTTP fetch fns                   | `lib/api/[feature]/fetchers.ts`         |
| Query keys, `queryOptions`, hooks    | `lib/api/[feature]/queries.ts`          |
| Server reads (DB/Supabase)           | `lib/dal/[feature].ts`                  |
| Server mutations                     | `lib/actions/[feature].ts`              |
| Realtime / invalidation hooks        | `lib/hooks/`                            |
| UI state stores                      | `lib/store/`                            |
| URL param parsers                    | `lib/searchParams.ts`                   |
| Zod schemas                          | `lib/validators/` (mirrors backend schemas when the backend is a separate repo) |
| DB schema + types (fullstack)        | `lib/db/schema/*.ts` — types via `$inferSelect` / `$inferInsert` |
| Generated types (supabase / OpenAPI) | `types/database.types.ts` · `types/api.generated.ts` — never edit |

### 4.2 New feature recipe

1. Zod schema in validators.
2. **external-api / spa:** add `API_ROUTES.FEATURE`, `fetchers.ts`, `queries.ts`.
   **fullstack / supabase:** add `lib/dal/feature.ts` (reads) + `lib/actions/feature.ts` (writes); add a Route Handler GET only if the client needs to refetch.
3. nuqs parsers in `lib/searchParams.ts` if filters/pagination exist.
4. `app/(app)/feature/page.tsx` + `loading.tsx` + `error.tsx`.
5. `components/views/feature/FeatureView.tsx` (`'use client'`).
6. Route-specific pieces in `components/pages/feature/`.
7. Zustand store only if §11 says so.

---

## §5. Page → View Pattern

`page.tsx` is a thin server component: parse params → start data → render View. No `'use client'`, no hooks, no business logic.

```tsx
// app/(app)/jobs/page.tsx
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { SearchParams } from 'nuqs/server';
import JobsView from '@/components/views/jobs/JobsView';
import { jobQueries } from '@/lib/api/jobs/queries';
import { getQueryClient } from '@/lib/queryClient';
import { jobListParamsCache } from '@/lib/searchParams';

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await jobListParamsCache.parse(searchParams);
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(jobQueries.list(filters));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <JobsView />
    </HydrationBoundary>
  );
}
```

```tsx
// components/views/jobs/JobsView.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useQueryStates } from 'nuqs';
import { jobQueries } from '@/lib/api/jobs/queries';
import { jobListParams } from '@/lib/searchParams';

export default function JobsView() {
  const [filters] = useQueryStates(jobListParams);
  const { data, isLoading } = useQuery(jobQueries.list(filters)); // hydrated → no loading flash
  // all interactivity, hooks and state live here
  return <div>...</div>;
}
```

**Rules:**

- PREFER `prefetchQuery` + `dehydrate` + `HydrationBoundary` over `initialData` props: no prop drilling, correct `dataUpdatedAt`, no stale data under a new key when filters change.
- `initialData` MAY be used for a single simple consumer; then also pass `initialDataUpdatedAt` and only when the key matches the SSR params exactly.
- Streaming variant for slow data: `void queryClient.prefetchQuery(...)` (no await), dehydrate pending queries (see §10.1), consume with `useSuspenseQuery` under `<Suspense>`.
- On TanStack Query versions that ship `queryClient.query()`, prefer it (`prefetchQuery`/`fetchQuery` are being deprecated) — check the installed version.
- **fullstack/supabase with no client refetch needed:** skip TanStack Query entirely — the page awaits the DAL and renders server components; mutations via Server Actions + `updateTag`.

---

## §6. HTTP Layer (fetch / axios)

### 6.1 Which client? (decided per project — record in profile)

| Use case                                                          | Choose                                  |
| ----------------------------------------------------------------- | --------------------------------------- |
| Server Components need Next.js fetch memoization / caching        | **Native `fetch` wrapper** (axios bypasses Next's patched fetch) |
| Default for new projects, bundle-size sensitive, low-end devices  | **Native `fetch` wrapper**              |
| SPA with token-refresh interceptors, upload/download progress, many cross-cutting interceptors | **axios** everywhere |
| SSR app that also needs interceptors/progress in the browser      | **fetch on server + axios on client** (share `API_ROUTES`, `ApiError`, types) |

Whichever is chosen, it lives **only** in `lib/api/client.ts` (+ `server.ts`). Components never import `axios` or call `fetch`.

### 6.2 Shared contract (all clients)

- One error type: `ApiError` (status, message, code, body). Callers check `instanceof ApiError`.
- Timeout on every request (default 10s).
- JSON by default; `FormData` passed through untouched; `204` → `undefined`.
- Query strings built with `toSearchParams()` — skips `undefined` / `null` / `''`, never casts.
- Browser requests send cookies (`credentials: 'include'` / `withCredentials: true`) when auth is cookie-based.
- Server requests forward the incoming cookie (or bearer) — never cached with `force-cache`.
- The client does **not** redirect on 401 — refresh (if applicable), then throw; redirects belong to `proxy.ts` or a single global handler.

```ts
// lib/api/errors.ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const isApiError = (err: unknown): err is ApiError => err instanceof ApiError;
```

### 6.3 Native fetch wrapper (canonical)

```ts
// lib/api/client.ts — isomorphic core
import { ApiError } from './errors';

type Primitive = string | number | boolean;
export type QueryParams = Record<string, Primitive | Primitive[] | null | undefined>;

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: QueryParams;
  timeoutMs?: number;
}

export function toSearchParams(query: QueryParams = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function createApi(baseUrl: string, getHeaders?: () => Promise<HeadersInit> | HeadersInit) {
  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const { body, query, timeoutMs = 10_000, headers, signal, ...init } = opts;
    const isForm = body instanceof FormData;
    const timeout = AbortSignal.timeout(timeoutMs);

    const res = await fetch(`${baseUrl}${path}${toSearchParams(query)}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !isForm && { 'Content-Type': 'application/json' }),
        ...(await getHeaders?.()),
        ...headers,
      },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string; code?: string } | null;
      throw new ApiError(res.status, err?.message ?? res.statusText, err?.code, err);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
    post: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'POST', body }),
    patch: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'PATCH', body }),
    put: <T, B = unknown>(path: string, body?: B, opts?: RequestOptions) =>
      request<T>(path, { ...opts, method: 'PUT', body }),
    delete: <T = void>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
  };
}

export const api = createApi(process.env.NEXT_PUBLIC_API_URL ?? '');
```

```ts
// lib/api/server.ts — used by Server Components / Route Handlers only
import 'server-only';
import { cookies } from 'next/headers';
import { createApi } from './client';

export const serverApi = createApi(process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '', async () => {
  const cookieHeader = (await cookies()).toString();
  return cookieHeader ? { Cookie: cookieHeader } : {};
});
```

Fetchers that run on both sides take the client as a parameter or have server/client variants (`getJobs(api)` / `getJobs(serverApi)`); never import `server.ts` from client code (`server-only` enforces this).

### 6.4 axios instance (canonical)

```ts
// lib/api/client.ts (axios projects)
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { ApiError } from './errors';
import { API_ROUTES } from './routes';

export const http = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
  timeout: 10_000,
});

let refreshing: Promise<void> | null = null;

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string; code?: string }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isRefreshCall = original?.url === API_ROUTES.AUTH.REFRESH;

    if (error.response?.status === 401 && original && !original._retry && !isRefreshCall) {
      original._retry = true;
      refreshing ??= http.post(API_ROUTES.AUTH.REFRESH).then(() => undefined).finally(() => {
        refreshing = null;
      });
      await refreshing; // single in-flight refresh; concurrent 401s wait on it
      return http(original);
    }

    throw new ApiError(
      error.response?.status ?? 0,
      error.response?.data?.message ?? error.message,
      error.response?.data?.code,
      error.response?.data,
    );
  },
);

export const api = {
  get: <T>(url: string, params?: object) => http.get<T>(url, { params }).then((r) => r.data),
  post: <T, B = unknown>(url: string, body?: B) => http.post<T>(url, body).then((r) => r.data),
  patch: <T, B = unknown>(url: string, body?: B) => http.patch<T>(url, body).then((r) => r.data),
  put: <T, B = unknown>(url: string, body?: B) => http.put<T>(url, body).then((r) => r.data),
  delete: <T = void>(url: string) => http.delete<T>(url).then((r) => r.data),
};
```

**axios supply-chain rule:** `axios@1.14.1` and `0.30.4` were malicious (npm account takeover, Mar 2026). For axios — and all deps — pin exact versions, commit the lockfile, install with `--frozen-lockfile` / `npm ci`, and block install scripts by default (pnpm default / `--ignore-scripts`).

### 6.5 API route constants

```ts
// lib/api/routes.ts
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  JOBS: {
    LIST: '/jobs',
    BY_ID: (id: string) => `/jobs/${id}`,
    STEPS: (jobId: string) => `/jobs/${jobId}/steps`,
  },
  STREAMS: {
    JOB_BOARD: '/streams/job-board',
  },
} as const;
```

Never hardcode endpoint strings elsewhere — including `EventSource` / WebSocket URLs.

### 6.6 Hono backends

- **Separate Hono repo (the usual case):** no RPC — `AppType` can't be imported across repos. Use the HTTP layer (§6.3/§6.4) + `API_ROUTES`, with response types generated from the backend's OpenAPI spec (`@hono/zod-openapi` on the backend, `openapi-typescript` in the frontend) or hand-written.
- **Hono mounted inside this Next.js repo** (`app/api/[[...route]]`): MAY use Hono RPC (`hc<AppType>`) for end-to-end types instead of `API_ROUTES`. Routes must be chained for inference; `strict: true`.
- RPC client — browser: `hc<AppType>(url, { init: { credentials: 'include' } })`; server: pass the forwarded cookie in `headers`.
- Hono CORS must list explicit origins with `credentials: true` (never `*` with cookies).
- Mounting Hono inside Next (`app/api/[[...route]]/route.ts` + `handle(app)`) is for BFF-style apps deployed together; a separate service when it needs independent scaling or non-web clients.
- Backend validates with `@hono/zod-validator` (or `@hono/zod-openapi`); frontend schemas mirror them (§4.0).

### 6.7 Response types

```ts
// types/api.ts
export interface ApiResponse<T> { success: true; data: T }
export interface ErrorResponse { success: false; message: string; code: string }
export interface PaginatedResponse<T> { success: true; data: T[]; total: number; totalPages: number }

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
```

Decide once per project whether the client **unwraps** `ApiResponse<T>` (returns `T`) — PREFER unwrapping in `client.ts`. List endpoints return `PaginatedResponse<T>`.

---

## §7. Server Actions + DAL (fullstack & supabase archetypes)

### 7.1 DAL

```ts
// lib/dal/session.ts
import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/auth'; // jwt-cookie or supabase getClaims()

export const verifySession = cache(async () => {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');
  return session; // { userId, orgId, role }
});
```

```ts
// lib/dal/clients.ts
import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { verifySession } from './session';

// Shared, non-sensitive, org-scoped → cacheable (orgId passed explicitly)
async function listClientsCached(orgId: string) {
  'use cache';
  cacheLife('minutes');
  cacheTag(`clients:${orgId}`);
  return db
    .select({ id: clients.id, name: clients.name, phone: clients.phone }) // DTO: only needed columns
    .from(clients)
    .where(eq(clients.orgId, orgId))
    .orderBy(desc(clients.createdAt));
}

export async function listClients() {
  const { orgId } = await verifySession(); // auth outside the cache scope
  return listClientsCached(orgId);
}
```

**DAL rules:** `server-only` always · `verifySession()` in every exported function · return minimal DTOs (`select` fields, never whole rows with secrets) · auth reads happen **outside** `'use cache'` scopes.

### 7.2 Server Action

```ts
// lib/actions/clients.ts
'use server';
import { updateTag } from 'next/cache';
import { z } from 'zod';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { verifySession } from '@/lib/dal/session';
import { createClientSchema } from '@/lib/validators/clients';
import type { ActionResult } from '@/types';

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const { orgId, role } = await verifySession();           // 1. authenticate
  if (role !== 'admin') return { ok: false, error: 'Forbidden' }; // 2. authorize

  const parsed = createClientSchema.safeParse(input);       // 3. validate (never trust the client)
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input', fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const [client] = await db.insert(clients).values({ ...parsed.data, orgId }).returning({ id: clients.id });
  updateTag(`clients:${orgId}`);                            // 4. invalidate
  return { ok: true, data: client };                        // 5. minimal DTO
}
```

**Action rules:**

- Actions are **public POST endpoints** — auth + authorization + Zod in every one, even if the page is protected.
- Check resource ownership (IDOR): `.where(and(eq(t.id, id), eq(t.orgId, orgId)))`, never `eq(t.id, id)` alone.
- Expected failures are **returned** (`ActionResult`), not thrown. Unexpected errors throw → `error.tsx`.
- Rate-limit expensive/abusable actions.
- Behind a reverse proxy, configure `serverActions.allowedOrigins`. Multi-instance self-hosting: set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`.
- Client usage: call via `useMutation({ mutationFn: createClientAction })` when TanStack Query owns the data (then invalidate query keys too), or via `useActionState` for progressive-enhancement forms.
- Client-side reads that need refetching → a Route Handler GET that calls the same DAL function.

### 7.3 Drizzle ORM (fullstack DB layer)

```ts
// lib/db/index.ts
import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from './schema';

// Reuse the connection across dev hot reloads (avoids "too many connections").
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };
const pg =
  globalForDb.pg ??
  postgres(env.DATABASE_URL, {
    max: 10,
    prepare: false, // required behind transaction poolers (Supabase pooler / PgBouncer)
  });
if (process.env.NODE_ENV !== 'production') globalForDb.pg = pg;

export const db = drizzle(pg, { schema, casing: 'snake_case' });
```

```ts
// lib/db/schema/clients.ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { orgs } from './orgs';

export const clients = pgTable(
  'clients',
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid().notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    phone: text().notNull(),
    email: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index('clients_org_id_idx').on(t.orgId)],
);

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
```

```ts
// lib/db/schema/index.ts — barrel of all tables + relations (passed to drizzle())
export * from './clients';
export * from './orgs';
export * from './relations';
```

```ts
// drizzle.config.ts (repo root)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
```

**Drizzle rules:**

- `lib/db/*` is `server-only`; only the DAL (`lib/dal`) and actions (`lib/actions`) import `db`. Components and route files never touch `db` directly.
- One file per table (or per aggregate) in `lib/db/schema/`; relations in `relations.ts`; everything re-exported from `schema/index.ts`.
- `casing: 'snake_case'` in both `drizzle()` and `drizzle.config.ts` → camelCase in TS, snake_case in SQL.
- Every table: `uuid` (or identity) PK, `createdAt`/`updatedAt` with timezone, FKs with explicit `onDelete`, **indexes on FK and filter/sort columns**.
- Types come from the schema (`$inferSelect` / `$inferInsert`) — never hand-written row types.
- Zod: MAY derive from tables with `createInsertSchema` / `createSelectSchema` (`drizzle-zod`, or `drizzle-orm/zod` on Drizzle v1+ — check installed version), then `.pick()`/`.omit()`/`.extend()` into form schemas in `lib/validators/`.
- Migrations: `drizzle-kit generate` → review the SQL → commit `drizzle/` → `drizzle-kit migrate` in CI/deploy. `drizzle-kit push` only against local/throwaway DBs. Never edit a migration that's already applied.
- Select only needed columns (`db.select({...})`) — the result is the DTO. Avoid `select()` of whole rows in anything returned to the client.
- No N+1: use joins or relational queries (`db.query.x.findMany({ with: {...}, columns: {...} })`), never queries inside loops.
- Multi-step writes in `db.transaction(async (tx) => { ... })`; use `tx` everywhere inside it.
- Paginate with `limit`/`offset` (or keyset on `createdAt, id` for large tables); return `PaginatedResponse<T>` with a `count()` query run in parallel (`Promise.all`).
- Upserts via `.onConflictDoUpdate()`; idempotent writes for offline replays (§17.3).
- `prepare: false` when connecting through a transaction pooler (Supabase pooler / PgBouncer). Serverless: use the pooler URL; keep `max` small.
- **Drizzle + Supabase:** Drizzle connects as a privileged role and **bypasses RLS** — the DAL's `verifySession()` + `orgId` filters are then the only guard. Either use Drizzle for server-only DAL code with explicit ownership filters, or use the Supabase client where RLS must apply. Don't mix both for the same table.
- Wrap cached reads with `'use cache'` + `cacheTag` in the DAL (§7.1); invalidate with `updateTag` in the action that writes.

---

## §8. Cookies & Auth

### 8.1 Cookie standards

| Attribute   | Value                                                                  |
| ----------- | ---------------------------------------------------------------------- |
| `httpOnly`  | `true` for any auth/session cookie                                     |
| `secure`    | `true` in production                                                   |
| `sameSite`  | `'lax'` default; `'strict'` for refresh tokens; `'none'` (+secure) only when truly cross-site |
| `path`      | `/`; refresh token scoped to the refresh endpoint path                 |
| `domain`    | Omit (host-only, use `__Host-` prefix) unless sharing across subdomains (`.example.com`) |
| `maxAge`    | Always set; access ≈ 15 min, refresh ≈ 7–30 days                       |

- `cookies()` is async. Server Components can **read** only; **set/delete** only in Server Actions, Route Handlers, or `proxy.ts` (via `NextResponse`).
- Reading cookies makes the scope dynamic — under `cacheComponents`, do it inside `<Suspense>`.
- CSRF: `SameSite=Lax` + no state changes on GET + Origin check (Server Actions do this). Cross-origin cookie APIs add a double-submit token.
- **NEVER** let a CDN/ISR cache a response carrying `Set-Cookie`.

### 8.2 JWT in httpOnly cookie (external-api / fullstack)

- Backend issues `access_token` (short) + `refresh_token` (long, rotated on every use, reuse detection revokes the family) as httpOnly cookies.
- Frontend on the same site (e.g. `app.example.com` + `api.example.com`) → cookies flow with `credentials: 'include'`; backend CORS: explicit origin + `credentials: true`.
- Server Components forward the incoming `Cookie` header (`serverApi`, §6.3). Never read the JWT into client JS.
- If the backend returns tokens in the body (BFF), a Route Handler / Server Action sets them as httpOnly cookies — never the browser.
- `proxy.ts`: optimistic check only (cookie present? else redirect to `/login`). Signature/role checks happen in the backend or DAL.
- Token refresh: backend endpoint + client interceptor (axios §6.4) or a fetch-wrapper retry-once; exactly one refresh in flight.
- Logout: server clears cookies (`maxAge: 0`) and revokes the refresh token; client `queryClient.clear()` + store resets.

### 8.3 Supabase Auth (`@supabase/ssr`)

```ts
// lib/supabase/server.ts
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component — proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
```

```ts
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database.types';

export const createClient = () =>
  createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
```

```ts
// src/proxy.ts
import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy'; // createServerClient w/ request+response cookies, then getClaims()

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
```

**Supabase rules:**

- Cookie adapter uses **only** `getAll` / `setAll`. `@supabase/auth-helpers-nextjs` is dead — never use it.
- Session refresh happens in **one place** (`proxy.ts`) — parallel refreshes trigger reuse detection and log users out.
- Protect pages/data with `supabase.auth.getClaims()` (verifies JWT); `getUser()` when you need fresh user data. **NEVER** trust `getSession()` on the server.
- Keys: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) in the browser; `SUPABASE_SECRET_KEY` (`sb_secret_…`) server-only, in `server-only` modules, for admin tasks only. Legacy `anon`/`service_role` keys are being retired — migrate.
- **RLS on every table** in exposed schemas; policies use `(select auth.uid())`. Views need `security_invoker = true`; audit `security definer` functions.
- Generated types: `supabase gen types typescript` → `types/database.types.ts`, regenerated in CI after migrations; type every client `<Database>`.
- Storage: private buckets, short-lived `createSignedUrl`, `createSignedUploadUrl` for client uploads, RLS on `storage.objects`.
- Realtime: channel created in `useEffect`, `supabase.removeChannel(channel)` in cleanup, unique channel names, filtered `postgres_changes` or Broadcast; event → `invalidateQueries` (§16).
- In the **supabase** archetype, reads MAY use the browser client inside `queryFn` (RLS enforces access); writes with side effects/secrets go through Server Actions.

---

## §9. Route Guard (`proxy.ts`)

- File is `proxy.ts` exporting `proxy` (Node runtime). `middleware.ts` is deprecated (Edge-only legacy).
- Allowed work: session refresh (Supabase), optimistic cookie-presence redirects, locale/rewrites, security headers / CSP.
- **NEVER** do DB queries or heavy work — it runs on every matched request, including prefetches.
- Exclude static assets, `_next/*`, `sw.js`, manifest, images via `matcher`.

---

## §10. TanStack Query (server state)

### 10.1 Setup

```ts
// lib/queryClient.ts
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
        // refetchOnWindowFocus: false  ← set per project (kiosk/tablet profiles)
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
```

```tsx
// lib/providers.tsx
'use client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from 'sonner';
import { getQueryClient } from '@/lib/queryClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        {children}
        <Toaster richColors duration={2000} />
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
```

**NEVER** export a module-level `new QueryClient()` in an SSR app.

### 10.2 Keys + `queryOptions` + hooks

```ts
// lib/api/jobs/queries.ts
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import type { CreateJobInput, JobFilters } from '@/types';
import { createJob, getJob, getJobs } from './fetchers';

export const jobKeys = {
  all: () => ['jobs'] as const,
  lists: () => [...jobKeys.all(), 'list'] as const,
  list: (filters: JobFilters) => [...jobKeys.lists(), filters] as const,
  details: () => [...jobKeys.all(), 'detail'] as const,
  detail: (id: string) => [...jobKeys.details(), id] as const,
};

export const jobQueries = {
  list: (filters: JobFilters) => queryOptions({ queryKey: jobKeys.list(filters), queryFn: () => getJobs(filters) }),
  detail: (id: string) => queryOptions({ queryKey: jobKeys.detail(id), queryFn: () => getJob(id), enabled: !!id }),
};

export const useJob = (id: string) => useQuery(jobQueries.detail(id));

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateJobInput) => createJob(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: jobKeys.lists() });
      toast.success('Job created');
    },
    onError: (err) => toast.error(isApiError(err) ? err.message : 'Something went wrong'),
  });
}
```

**Rules:**

- Keys are hierarchical factories per feature (`[feature]Keys`); invalidate by factory (`jobKeys.lists()`), never literal arrays.
- `queryOptions()` is the single source for key + fn — reused by `useQuery`, `useSuspenseQuery`, prefetch, `getQueryData`, `setQueryData`.
- Mutation hooks own toasts (`onSuccess`/`onError`); components pass only UI callbacks via `mutate(data, { onSuccess })`.
- Invalidate **every** affected key (list + detail + nested resources).
- `isLoading` for first-load query state; `isPending` for mutations; `isFetching` for background refetch indicators.
- Optimistic updates: single-place UI → render from mutation `variables`; multi-place → `onMutate` (cancelQueries, snapshot, setQueryData) / `onError` (rollback) / `onSettled` (invalidate).
- No N+1 on the client: never a `useQuery` per table row — fetch lists with the data they need (joins/aggregates on the backend).

---

## §11. Client State: when to use what

| State                                             | Tool                               |
| ------------------------------------------------- | ---------------------------------- |
| Server data                                       | TanStack Query (or RSC-only)       |
| Shareable/bookmarkable view state: filters, search, sort, pagination, active tab, selected id in URL | **nuqs** |
| Form values & validation                          | React Hook Form                    |
| Local to one component (open/closed, hover)       | `useState`                         |
| Shared across distant components, not in URL: modals, multi-row selection, sidebar, wizard step, client prefs | **Zustand** |
| Persisted client prefs (theme, density)           | Zustand `persist` (or cookie if SSR needs it) |

If you're syncing Zustand ⇄ TanStack Query, or Zustand ⇄ URL → stop and redesign.

---

## §12. nuqs (URL state) — when used

### 12.1 Parsers (shared client + server)

```ts
// lib/searchParams.ts
import {
  createSearchParamsCache,
  createSerializer,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server';

export const jobStatuses = ['draft', 'active', 'done'] as const;

export const jobListParams = {
  q: parseAsString.withDefault(''),
  status: parseAsStringLiteral(jobStatuses),
  limit: parseAsInteger.withDefault(20),
  offset: parseAsInteger.withDefault(0),
};

export const jobListParamsCache = createSearchParamsCache(jobListParams);
export const serializeJobListParams = createSerializer(jobListParams); // type-safe hrefs
```

### 12.2 Client usage

```tsx
'use client';
import { debounce, useQueryStates } from 'nuqs';
import { jobListParams } from '@/lib/searchParams';

const [{ q, offset }, setParams] = useQueryStates(jobListParams);

const onSearch = (value: string) =>
  setParams({ q: value, offset: 0 }, { limitUrlUpdates: value ? debounce(300) : undefined });
```

**Rules:**

- Parsers defined **once** in `lib/searchParams.ts`; server (`cache.parse` / `createLoader`) and client (`useQueryStates`) use the same object.
- Pick **one** owner of the data for URL-driven pages:
  - **Client owns (default with TanStack Query):** keep `shallow: true` (default). Filters go into the query key → client fetch. SSR only hydrates the first load. No server round-trip per keystroke.
  - **Server owns (RSC-only pages, no TanStack Query):** `shallow: false` + `startTransition` for pending UI.
  - **NEVER** `shallow: false` *and* a client query on the same params — that double-fetches.
- Text inputs: `limitUrlUpdates: debounce(300)` (`throttleMs` is deprecated). If the value feeds a query key, debounce the key value too.
- Always reset `offset`/`page` when any filter changes — in the **same** `setParams` call.
- `useQueryStates` for related keys (atomic updates). `clearOnDefault` is on by default — keep URLs clean.
- Validate enum-ish params with `parseAsStringLiteral` / `parseAsNumberLiteral`; use `urlKeys` for short URLs if needed.
- `useSearchParams`-based hooks need a `<Suspense>` boundary.

---

## §13. Zustand (UI state) — when used

### 13.1 SSR apps: store factory + provider (no module-level singletons)

```ts
// lib/store/jobStore.ts
import { createStore } from 'zustand/vanilla';
import { devtools } from 'zustand/middleware';

export interface JobUiState {
  selectedJobId: string | null; // ids, not server objects
  isDetailOpen: boolean;
}
export interface JobUiActions {
  openDetail: (id: string) => void;
  closeDetail: () => void;
  reset: () => void;
}
export type JobUiStore = JobUiState & JobUiActions;

const initialState: JobUiState = { selectedJobId: null, isDetailOpen: false };

export const createJobStore = (init: Partial<JobUiState> = {}) =>
  createStore<JobUiStore>()(
    devtools(
      (set) => ({
        ...initialState,
        ...init,
        openDetail: (id) => set({ selectedJobId: id, isDetailOpen: true }),
        closeDetail: () => set({ selectedJobId: null, isDetailOpen: false }),
        reset: () => set(initialState),
      }),
      { name: 'job-store', enabled: process.env.NODE_ENV !== 'production' },
    ),
  );
```

```tsx
// lib/store/JobStoreProvider.tsx
'use client';
import { createContext, useContext, useState } from 'react';
import { useStore } from 'zustand';
import { createJobStore, type JobUiStore } from './jobStore';

const JobStoreContext = createContext<ReturnType<typeof createJobStore> | null>(null);

export default function JobStoreProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createJobStore());
  return <JobStoreContext.Provider value={store}>{children}</JobStoreContext.Provider>;
}

export function useJobStore<T>(selector: (s: JobUiStore) => T): T {
  const store = useContext(JobStoreContext);
  if (!store) throw new Error('useJobStore must be used within JobStoreProvider');
  return useStore(store, selector);
}
```

**SPA / client-only archetype:** plain `create()` module stores are fine.

**Rules:**

- UI state only; store **ids**, not server objects (look the object up via TanStack Query).
- Always `devtools` with a `name`, **disabled in production**.
- Always select atomically: `useJobStore((s) => s.isDetailOpen)`. Multiple fields → `useShallow` (`zustand/react/shallow`); never select the whole store.
- Compound actions (`openDetail`) over individual setters; always a `close`/`reset` action.
- Server Components never read or write stores.
- `persist`: `partialize`, `version` + `migrate`, and `skipHydration` + manual `rehydrate()` in `useEffect` to avoid hydration mismatches.
- Large stores → slices pattern; middleware applied once at the combined store.
- Scope providers to the subtree that needs them (feature layout), not the root, unless truly global.

---

## §14. Forms (React Hook Form + Zod v4 + shadcn)

```tsx
'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { FloatingLabelInput, FormControl, FormField, FormGrid, FormItem, FormMessage } from '@/components/common/form';
import { useCreateClient } from '@/lib/api/clients/queries';
import { type CreateClientInput, createClientSchema } from '@/lib/validators/clients';

interface CreateClientFormProps {
  onSuccess: () => void;
}

export default function CreateClientForm({ onSuccess }: CreateClientFormProps) {
  const { mutate, isPending } = useCreateClient();
  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { name: '', phone: '', email: '' },
  });

  const onSubmit = (data: CreateClientInput) =>
    mutate(data, { onSuccess }); // toasts live in the mutation hook

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FormGrid>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput {...field} id="email" label="Email" type="email" required />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </FormGrid>
      <div className="flex justify-end gap-2 mt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
```

**Rules:**

- Schema imported from `lib/validators/` — **never** inline in the component. The same schema validates in the Server Action / Route Handler (fullstack) or mirrors the backend's (separate backend repo). Server re-validates always.
- `defaultValues` for every field.
- Loading state from `isPending` (mutation or `useActionState`) — no separate `useState`. (If the Save button sits outside the `<form>`, `useIsMutating` is allowed.)
- Toasts in the mutation hook; component-specific success (reset, close modal) via `mutate(data, { onSuccess })`. Never a toast in the form component.
- **Field shape (owner's format, one primitive set):** `FormField` (RHF `Controller`) → `<FormItem className="min-h-19">` → `<FormControl>` wrapping a `FloatingLabelInput` → `<FormMessage />`. `min-h-19` (76 px) is on the whole item (control + message) so an error never resizes the form. Applies to every field type (text, number, date trigger, Time, chips, switch, checkbox) on desktop and touch.
- The five parts (`FormField`, `FormItem`, `FormControl`, `FormMessage`, `FloatingLabelInput`) live **once** in `components/common/form`, built on shadcn `Field` / `FieldError` + RHF `Controller`. Do not install the legacy shadcn `form` component and do not hand-roll a label + error `<p>`.
- Required marker `*` (in the floating label) plus `aria-required`; `aria-invalid` and `aria-describedby` are set by the primitives.
- Layout: `FormGrid` is a container-query grid (1 / 2 / 3 / 4 columns by the form's own width, cells ≥ 240 px), not window breakpoints. Group related fields with `FormSection`.
- Submit disabled while pending with `'Saving...'`; main action right-aligned (desktop header / action bar on phones); **no Reset button**.
- On a failed Save: errors at every field, a top summary when ≥ 3, focus the first problem (`useFocusFirstProblem`; no smooth scroll under reduced motion). One implementation, never per form.
- Zod v4: `z.email()` (not `z.string().email()`), `error:` param (not `message:`). If schema has `.default()`/transforms, type `useForm<z.input<typeof S>, unknown, z.output<typeof S>>`. Text-to-number via a zod pipe, one number parser.
- Server Action forms: `useActionState(action, initial)` with `ActionResult` + `fieldErrors`, or RHF `handleSubmit` → action → map `fieldErrors` with `form.setError`.
- Colours: never raw hex/oklch or arbitrary colour values in components — only semantic Tailwind classes backed by tokens in `globals.css` (`bg-primary`, `text-brand`, `bg-info-soft`, …).

---

## §15. Data Tables (TanStack Table v9)

Pages never import `@tanstack/react-table`; they build columns with the wrapper's helper from `components/common/DataTable`.

```tsx
// components/pages/jobs/columns.tsx
import { createDataTableColumnHelper } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import type { Job } from '@/types';

const helper = createDataTableColumnHelper<Job>();

// Don't annotate the result as DataTableColumnDef[] — that erases the typed accessor values.
export const createColumns = (onView: (job: Job) => void) =>
  helper.columns([
    helper.accessor('reference_code', {
      header: 'Job',
      cell: ({ cell }) => <span className="font-mono text-sm">{cell.getValue()}</span>,
    }),
    helper.accessor('status', { header: 'Status', cell: ({ row }) => <JobStatusBadge status={row.original.status} /> }),
    helper.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => onView(row.original)}>
          View
        </Button>
      ),
    }),
  ]);
```

```tsx
// inside DataTable (components/common/DataTable.tsx) — v9 API
import { createColumnHelper, tableFeatures, useTable, type ColumnDef, type RowData } from '@tanstack/react-table';

const features = tableFeatures({}); // features are opt-in; core row model is automatic
type F = typeof features; // ColumnDef<F, TData>, createColumnHelper<F, TData>()

const table = useTable({ features, columns, data }); // features/columns module-scope or memoized; data stable
// render: <table.FlexRender header={header} /> / <table.FlexRender cell={cell} />; cells via row.getAllCells()
```

**Rules:**

- Always the shared `components/common/DataTable` + `TablePagination` (`offset, limit, total, onPageChange, onLimitChange?`).
- Column **factory** receiving action callbacks (pure column defs); build with `createDataTableColumnHelper<T>()`.
- Columns stable across renders: `useMemo(() => createColumns(onView), [onView])` unless React Compiler is on. `data` must be stable too (module-level `EMPTY` fallback, not `?? []` inline).
- Codes/ids `font-mono text-sm`; status → badge component; actions column `helper.display({ id: 'actions', header: '' })`, ghost/sm buttons.
- Server-side pagination/sort/filter for large sets (state in nuqs `offset`/`limit` → query key). `DataTable` registers no client features and renders rows as the API returned them, so no `manual*` flags are needed. Only if a table owns paging itself: register `rowPaginationFeature`, set `manualPagination: true`, `rowCount: total`, state `{ pageIndex, pageSize }` + `onPaginationChange`, put server-owned slices in the query key, `placeholderData: keepPreviousData`.
- Client features are opt-in in `tableFeatures` (e.g. `tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel() })`); row-model slots go inside it.
- v9 renames: `useReactTable` → `useTable`; `flexRender` → `<table.FlexRender>`; `getCoreRowModel` gone; `table.getState()` → `table.state`; per-slice `onXChange` replaces `onStateChange`; `sortingFn` → `sortFn`; pinning `left/right` → `start/end`; `columnSizingInfo` → `columnResizing`. Call row/cell/header methods on the instance; never destructure them.
- React Compiler: no `'use no memo'` for stateless tables. If you add state-driven row/cell reads (e.g. `row.getIsSelected()`), use `table.Subscribe` or a `useTable` selector.
- > ~100 visible rows → virtualize (`@tanstack/react-virtual`).

---

## §16. Realtime

```ts
// lib/hooks/useLiveInvalidation.ts
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

export function useLiveInvalidation(url: string, queryKey: QueryKey, throttleMs = 1_000) {
  const qc = useQueryClient();

  useEffect(() => {
    const stream = new EventSource(url, { withCredentials: true });
    let timer: ReturnType<typeof setTimeout> | undefined;

    stream.onmessage = () => {
      if (timer) return; // coalesce bursts into one refetch
      timer = setTimeout(() => {
        timer = undefined;
        qc.invalidateQueries({ queryKey });
      }, throttleMs);
    };

    return () => {
      clearTimeout(timer);
      stream.close();
    };
  }, [url, qc, queryKey, throttleMs]);
}
```

**Rules:**

- Transport by archetype: external-api → backend SSE/WebSocket; supabase → Realtime channel (cleanup with `removeChannel`); fullstack → Route Handler SSE or a managed service.
- Events trigger `invalidateQueries` (or `setQueryData` when the event carries the full record) — **never** `setState` mirrors.
- Coalesce bursts (throttle invalidations).
- One connection per logical view, not per component; always close in cleanup.
- URLs from `API_ROUTES`; memoize `queryKey` passed in (or pass a factory result from a stable scope).
- Polling fallback: `refetchInterval` on the query, paused when tab hidden (default).

---

## §17. PWA (when `pwa ≠ false`)

### 17.1 Installable

- `app/manifest.ts` returning `MetadataRoute.Manifest` (name, short_name, `start_url`, `display: 'standalone'`, theme/background colors, icons 192 + 512 + maskable).
- HTTPS required; test locally with `next dev --experimental-https`.
- Don't depend on `beforeinstallprompt` (Chromium-only). iOS: show "Share → Add to Home Screen" instructions.

### 17.2 Service worker (offline-first)

- Use **Serwist**: `@serwist/turbopack` for the default Turbopack build; `@serwist/next` only on webpack builds. `next-pwa` is obsolete — never use it.
- MAY evaluate Next's built-in `experimental.useOffline` / `useOffline()` (experimental in 16.3) for simple offline navigation retry.
- Serve `sw.js` with `Cache-Control: no-cache, no-store, must-revalidate`; register with `updateViaCache: 'none'`.
- Caching strategies:

| Resource                          | Strategy                   |
| --------------------------------- | -------------------------- |
| Hashed static assets (`/_next/static`) | Cache-first (precache) |
| HTML / navigations                | Network-first → offline fallback page |
| API GETs safe to show stale       | Stale-while-revalidate     |
| Images                            | Cache-first with expiration/max entries |
| Authenticated / per-user API      | Network-only (or private, per-user cache with explicit expiry) |
| Mutations                         | Never cached — queue (below) |

- Update flow: detect waiting SW → toast "Update available" → `skipWaiting` on confirm → reload. Never silently swap mid-task.

### 17.3 Offline data

- Reads: `PersistQueryClientProvider` + IndexedDB persister; `gcTime ≥ maxAge`; `buster` = app version; `useIsRestoring` to gate UI.
- Writes: TanStack paused mutations with `setMutationDefaults(key, { mutationFn })` + `resumePausedMutations()` after restore, **or** an IndexedDB outbox (`idb` / Dexie) replayed on `online` / Background Sync. Mutations **must be idempotent** (client-generated ids / idempotency keys).
- `networkMode: 'offlineFirst'` for queries backed by SW caches.
- IndexedDB access only in client code (`useEffect`, `ssr: false`).
- Show connection state in the UI (offline banner, pending-sync count).
- iOS: push only for home-screen installed PWAs (16.4+), background sync limited, storage may be evicted — design for re-sync.

### 17.4 Push (optional)

VAPID keys (`web-push`), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` public, private key server-only; subscriptions saved via Server Action/Route Handler; permission requested only after a user gesture.

---

## §18. Performance Checklist

**Server/client boundary & bundle**
- [ ] `page.tsx` / `layout.tsx` are Server Components; `'use client'` only on interactive leaves; server content passed as `children`.
- [ ] No heavy libs in client components when a server component can do it (markdown, date formatting of static data, syntax highlighting).
- [ ] Heavy/rarely-used client widgets (charts, editors, maps, PDF) loaded with `next/dynamic` / `import()` on interaction.
- [ ] shadcn imported per component (`@/components/ui/button`), never via a barrel.
- [ ] No barrel files re-exporting components/modules in hot paths (types-only barrels are fine).
- [ ] `server-only` on server modules so they never leak into client bundles.
- [ ] React Compiler on (or disciplined `memo`/`useMemo` where measurable).
- [ ] Bundle checked with `next experimental-analyze` (Turbopack) before shipping large features.

**Data**
- [ ] Parallel fetches (`Promise.all`); no request waterfalls between layout and page.
- [ ] `React.cache()` on per-request shared reads; `'use cache'` + tags on shared data.
- [ ] Prefetch + `HydrationBoundary` → no client loading flash on first render; `staleTime > 0`.
- [ ] No double fetching (nuqs `shallow: false` + client query on the same params).
- [ ] Lists paginated server-side; no per-row queries; payloads trimmed to needed fields.
- [ ] No 4xx retries; timeouts on every request.
- [ ] Realtime invalidations coalesced.

**Rendering & UX**
- [ ] PPR shell + granular `<Suspense>`; skeletons mirror real layout (no generic spinners).
- [ ] `loading.tsx` + `error.tsx` on every data route.
- [ ] Debounced search inputs (300ms).
- [ ] Optimistic UI for frequent, low-risk mutations.
- [ ] `<Link>` prefetch defaults kept; `prefetch={false}` on huge link lists.

**Assets**
- [ ] `next/image` with `sizes` for responsive/`fill`; LCP image `loading="eager"` / `fetchPriority="high"` (`priority` is deprecated).
- [ ] `images.remotePatterns` (not `domains`); short-lived signed URLs → `unoptimized` (they break the optimizer cache).
- [ ] `next/font` with subsets, variable fonts, `display: 'swap'`.
- [ ] Third-party scripts via `next/script` (`afterInteractive` / `lazyOnload`) or `@next/third-parties`.
- [ ] Files/attachments loaded on demand via signed URLs, never eagerly.

**Measure**
- [ ] Core Web Vitals (LCP < 2.5s, INP < 200ms, CLS < 0.1) reported via `useReportWebVitals` or platform analytics.
- [ ] Lighthouse/perf check on the project's target device profile (mid-range Android for `low-end`/`kiosk`).

---

## §19. Security Checklist

- [ ] Auth checked in DAL/actions/handlers/backend — not only `proxy.ts` or layouts.
- [ ] Every action/handler: authn + authz + Zod + ownership check + minimal DTO.
- [ ] Auth cookies httpOnly/secure/sameSite; no tokens in JS-readable storage.
- [ ] No secrets in `NEXT_PUBLIC_*`; secret modules import `server-only`.
- [ ] Env validated at startup (`lib/env.ts` with Zod or t3-env; import in `instrumentation.ts`).
- [ ] Security headers in `next.config` `headers()`: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `frame-ancestors`/`X-Frame-Options`, CSP (nonce only on fully dynamic apps; otherwise `experimental.sri`/hash).
- [ ] CORS on external backends: explicit origins, credentials only where needed.
- [ ] Supabase: RLS everywhere, secret key server-only, private buckets.
- [ ] Dependencies pinned, lockfile committed, install scripts blocked, `npm audit`/Socket in CI; Next.js kept on the **latest patch** (frequent security releases).
- [ ] `dangerouslySetInnerHTML` only with sanitized input.

---

## §20. Error Handling

| File / API                  | Rule                                                                  |
| --------------------------- | --------------------------------------------------------------------- |
| `error.tsx`                 | `'use client'`; props `{ error, retry }` (16.3+; prefer `retry` over `reset`); friendly message + retry button; report error |
| `global-error.tsx`          | Must render its own `<html>`/`<body>`                                 |
| `not-found.tsx` + `notFound()` | For missing resources/unknown params                               |
| `catchError` (`next/error`) | Component-level boundaries that don't swallow `notFound()`/`redirect()` |
| `forbidden()` / `unauthorized()` | Experimental (`authInterrupts`) — only if the project opts in    |
| `instrumentation.ts`        | `onRequestError` → error reporting                                    |
| `after()`                   | Logging/analytics after response (read cookies/headers before calling) |

- Expected errors → return values (`ActionResult`) or `ApiError` handled in mutation `onError`.
- Unexpected errors → throw → nearest `error.tsx`.
- Don't wrap `redirect()` / `notFound()` in `try/catch` (or rethrow with `unstable_rethrow`).
- Event-handler errors aren't caught by boundaries — handle them (toast).

---

## §21. TypeScript Conventions

- `strict: true`; **no `any`** ever (`unknown` + narrowing).
- `interface` for object shapes; `type` for unions, aliases, intersections.
- Props: `[ComponentName]Props`.
- DB types come from Drizzle (`$inferSelect`/`$inferInsert`), `supabase gen types`, or the backend's OpenAPI — never redefined; derive DTOs with `Pick`/`Omit`.
- Zod schemas are the source of truth for inputs: `type X = z.infer<typeof xSchema>`.
- `as const` for constant objects/enums (`API_ROUTES`, status lists).
- Use `PageProps<'/route'>` / `LayoutProps` helpers and `typedRoutes` where available.
- No non-null `!` except on validated env access.

---

## §22. Code Style

| Rule             | Convention                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Exports          | `export default` for components/pages; named exports for utilities, types, hooks, actions   |
| Component naming | PascalCase filenames; `export default function ComponentName()`                             |
| Hook naming      | `use[Name]`, file `use[Name].ts`                                                            |
| Store naming     | `[feature]Store.ts`, `use[Feature]Store`, devtools name `[feature]-store`                   |
| Query keys       | `[feature]Keys` factory + `[feature]Queries` (`queryOptions`)                               |
| Actions          | `[verb][Entity]Action` in `lib/actions/[feature].ts`                                        |
| Import order     | React/Next → third-party → `@/components` → `@/lib` → `@/types` → relative |
| Quotes           | Single in TypeScript; double in JSX attributes                                              |
| Semicolons       | Yes                                                                                         |
| Indentation      | 2 spaces                                                                                    |
| Path alias       | `@/*` → `./src/*`                                                                           |
| Icons            | `<HugeiconsIcon icon={…} />` (Hugeicons) only                                               |
| Dates            | `date-fns` only                                                                             |
| Colors           | Theme tokens (`text-destructive`, `bg-muted`) — no raw palette colors for semantic UI       |
| Class merging    | `cn()` from `lib/utils.ts`                                                                  |
| Lint/format      | Biome — `biome check .` must pass before every commit                                       |
| User-facing text | No i18n library (for now). Multilingual apps: typed dictionaries in `lib/messages/` (§22.1) — no hardcoded strings in components |


### 22.1 User-facing text (no i18n library)

Single-language apps MAY keep strings inline. Multilingual apps (or ones likely to be) use plain typed dictionaries, so that swapping in a library later is mechanical:

```ts
// lib/messages/en.ts
export const en = {
  common: { save: 'Save', saving: 'Saving...', reset: 'Reset', error: 'Something went wrong' },
  jobs: { created: 'Job created' },
} as const;

// lib/messages/hi.ts — must match the shape of en exactly
import type { Messages } from '.';
export const hi: Messages = {
  common: { save: 'सहेजें', saving: 'सहेजा जा रहा है...', reset: 'रीसेट', error: 'कुछ गलत हो गया' },
  jobs: { created: 'जॉब बनाया गया' },
};

// lib/messages/index.ts
import { en } from './en';
import { hi } from './hi';
type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };
export type Messages = DeepString<typeof en>;
export const messages = { en, hi } as const;
export type Locale = keyof typeof messages;
export const getMessages = (locale: Locale): Messages => messages[locale];
```

- `en` is the source of truth. Other locales are typed `Messages`, so a missing key is a compile error.
- Locale comes from a cookie or the user profile, read on the server. Pass `getMessages(locale)` or the relevant slice to client components as props (or through a small context). Don't bundle every locale into the client.
- Toasts in mutation hooks use the same dictionaries.
- Format dates with `date-fns` locales, and numbers/currency with `Intl.NumberFormat`. Never concatenate strings to build sentences.
- Add a library such as `next-intl` only when pluralization, ICU messages or locale routing are needed. Record that decision in the project's `CLAUDE.md`.

---

## §23. Environment Variables

| Pattern                        | Scope        | Notes                                                     |
| ------------------------------ | ------------ | --------------------------------------------------------- |
| `NEXT_PUBLIC_*`                | Client + server | **Inlined at build time** — public, frozen per build     |
| Everything else                | Server only  | Read in `server-only` modules; runtime values need dynamic rendering |
| `NEXT_PUBLIC_API_URL`          | Client       | Browser → backend base URL (external-api/spa)             |
| `API_URL`                      | Server       | Server → backend (internal network URL if available)      |
| `NEXT_PUBLIC_SUPABASE_URL`     | Client       | Supabase project URL                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client | RLS-enforced publishable key                             |
| `SUPABASE_SECRET_KEY`          | Server only  | Admin tasks only — never in client code, ever             |
| `DATABASE_URL`                 | Server only  | fullstack (Drizzle); pooler URL on serverless             |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | Server | Multi-instance self-hosting with Server Actions           |

- Validate in `lib/env.ts` (split server/client schemas) and fail fast at startup.
- Never commit `.env*.local`; every var documented in `.env.example` with a description.
- Build-once-deploy-many needs runtime config → don't put environment-specific values in `NEXT_PUBLIC_*`; expose them via a server-rendered config instead.

---

## §24. Optional Device Profiles

Declared in the project profile; project `CLAUDE.md` adds domain specifics.

**`low-end`** (mid-range Android, flaky WiFi): all §18 items mandatory; `refetchOnWindowFocus: false`; aggressive code splitting; PWA offline-first; avoid large client libraries and animations.

**`kiosk` / field workers** (gloves, shared tablets, low literacy):
- No free-text input — tap choices or large numpad only.
- ≤ 3 choices per screen — split into more screens otherwise.
- Tap targets ≥ 56px.
- Localized UI (all labels, feedback, toasts) in the workers' language, via the §22.1 dictionaries.
- Offline-capable with an IndexedDB queue and sync on reconnect.
- Photo as evidence instead of written descriptions.
- Passwordless login (QR / device session).
- Confirmation, not entry — system pre-fills, user confirms or adjusts one value.
- CSR-only routes; `refetchOnWindowFocus: false`.

---

## §25. Anti-Patterns → Correct Pattern

| ❌ Don't                                                   | ✅ Do                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------- |
| Server Action proxying to an external backend             | Call the backend via the HTTP layer + `useMutation`             |
| Server Action to fetch data                               | DAL in RSC, or Route Handler GET + `useQuery`                   |
| `fetch('/api/x')` from a Server Component to own app      | Call the DAL function directly                                  |
| `fetch`/`axios` in a component                            | `lib/api/[feature]/fetchers.ts` + `queries.ts`                  |
| Hardcoded `'/jobs/' + id`                                 | `API_ROUTES.JOBS.BY_ID(id)`                                     |
| `useEffect` + `useState` fetching                         | `useQuery`                                                      |
| Module-level `new QueryClient()` in SSR app               | `getQueryClient()`                                              |
| `initialData` from props with changing filters            | `prefetchQuery` + `HydrationBoundary`                           |
| `shallow: false` + client `useQuery` on same params       | `shallow: true` + query key from params                         |
| `throttleMs: 300`                                         | `limitUrlUpdates: debounce(300)`                                |
| Server objects in Zustand                                 | Ids in Zustand, objects from TanStack Query                     |
| `useStore()` selecting whole store                        | Atomic selector / `useShallow`                                  |
| Global Zustand store in SSR app                           | `createStore` + Provider                                        |
| `router.refresh()` after client mutation                  | `invalidateQueries` (client) / `updateTag` (action)             |
| Auth check only in `proxy.ts` / layout                    | `verifySession()` in DAL/action/backend                         |
| JWT in `localStorage`                                     | httpOnly cookie                                                 |
| `supabase.auth.getSession()` on server                    | `getClaims()` / `getUser()`                                     |
| `anon` / `service_role` keys                              | publishable / secret keys                                       |
| `@supabase/auth-helpers-nextjs`                           | `@supabase/ssr` (`getAll`/`setAll`)                             |
| `middleware.ts`                                           | `proxy.ts`                                                      |
| Sync `params` / `cookies()`                               | `await` them                                                    |
| `export const revalidate` under cacheComponents           | `'use cache'` + `cacheLife`                                     |
| `revalidateTag('x')`                                      | `revalidateTag('x', 'max')` or `updateTag('x')` in actions      |
| `cookies()` inside `'use cache'`                          | Read outside, pass as argument                                  |
| `<Image priority>` / `images.domains`                     | `loading="eager"`/`fetchPriority` · `remotePatterns`            |
| `dynamic(..., { ssr: false })` in a Server Component      | Only inside a client component                                  |
| `next-pwa`                                                | Serwist (`@serwist/turbopack`)                                  |
| `next lint`                                               | `biome check .`                                                 |
| Inline Zod schema in a form                               | Shared schema from validators                                   |
| shadcn `<Form>` in new code                               | `Field` + `Controller`                                          |
| Toast inside form component                               | Mutation hook `onSuccess`/`onError`                             |
| `const [loading, setLoading]` for submit                  | `isPending`                                                     |
| Editing `components/ui/*`                                 | Wrap in `components/common/`                                    |
| `<img>` / raw `<script>`                                  | `next/image` / `next/script`                                    |
| Barrel import from `@/components/ui`                      | Per-component import                                            |
| Generic spinner page loader                               | Shape-matching skeleton                                         |
| `useQuery` per table row                                  | One list query with needed fields                               |
| `any`                                                     | Proper type or `unknown` + narrowing                            |
| Icons/dates from other libs                               | `HugeiconsIcon` / `date-fns`                                    |
| Unpinned deps, install scripts allowed                    | Pinned + lockfile + scripts blocked                             |

---

## §26. Pre-Completion Checklist (run before finishing any task)

- [ ] Followed the project's archetype data path (§1); no forbidden Server Actions / direct fetches / hardcoded endpoints.
- [ ] New endpoints in `API_ROUTES`; fetchers + key factory + `queryOptions` + hooks in `lib/api/[feature]/` (or DAL + actions for fullstack/supabase).
- [ ] Actions/handlers: auth + authz + Zod + ownership + DTO + tag invalidation.
- [ ] Mutations invalidate every affected key; toasts in mutation hooks.
- [ ] `page.tsx` thin server component; `loading.tsx` skeleton + `error.tsx` present; runtime data inside Suspense.
- [ ] Rendering strategy matches §3.2; no user data in shared caches; `cacheLife` set in each `'use cache'`.
- [ ] `'use client'` at leaves; heavy widgets lazy-loaded.
- [ ] nuqs (if used): shared parsers, one data owner, debounced text inputs, offset reset in same update.
- [ ] Zustand (if used): UI state only, provider pattern in SSR, atomic selectors, devtools dev-only, reset action.
- [ ] Forms: shared schema, `defaultValues`, `isPending`, owner's `FormItem min-h-19` field shape, required `*`, server re-validation, no raw colours.
- [ ] Realtime: coalesced invalidations, cleanup closes connection.
- [ ] Cookies/auth per §8; no tokens in JS storage; no secrets in `NEXT_PUBLIC_*`.
- [ ] Images/fonts/scripts via Next components; `sizes` set.
- [ ] PWA (if enabled): SW cache strategies per §17.2; mutations idempotent.
- [ ] Device-profile rules (§24) respected.
- [ ] No `any`; naming + import order per §22; `.env.example` updated.
- [ ] `biome check .` and `tsc --noEmit` pass.
