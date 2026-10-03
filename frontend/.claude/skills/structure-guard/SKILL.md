---
name: structure-guard
description: "Use when deciding where to place a file, naming a component or hook, organizing imports, adding a route, or checking the page → view → pages-component pattern in frontend/. Triggers: where to put, which folder, file placement, route layout, naming convention, import order, page structure, folder structure, queries.ts, fetchers.ts, views, store placement. Not for form logic, state management, or data fetching."
---

# Structure guard (frontend/)

Full rules: `docs/standards/nextjs-standards.md` §4 and §22. This is the decision guide for this repo: a
standalone Next.js app (no workspaces, no `packages/*`), archetype `external-api`.

## Folder map
```
frontend/
├── src/proxy.ts                       optimistic redirect only (never the sole auth check)
├── src/app/
│   ├── (auth)/login/                  public
│   ├── (app)/admin/[feature]/         thin page.tsx + loading.tsx + error.tsx ('use client')
│   ├── checkin/                       public check-in fallback page (QR landing)
│   └── tv/                            TV routes (tv-dev): page.tsx, lab/, login/
├── src/components/
│   ├── ui/                            shadcn primitives — never edited (hook blocks it)
│   ├── common/                        DataTable, TablePagination, SearchBar, ErrorComponent, EmptyState
│   ├── pages/[feature]/               route-specific UI pieces (forms, columns.tsx, search bars)
│   └── views/[feature]/               'use client' stateful containers rendered by page.tsx
├── src/tv/                            TV only (tv-dev): scenes/, components/, store/, lab/, theme.ts
├── src/lib/
│   ├── api/{client,server,errors,routes}.ts + [feature]/{fetchers,queries}.ts
│   ├── timer/                         pure timer maths (tv-dev), tested against timer-cases.json
│   ├── store/[feature]Store.ts        Zustand factory + provider (UI state only)
│   ├── validators/                    Zod form schemas mirroring the backend's
│   ├── searchParams.ts · providers.tsx · queryClient.ts · env.ts · utils.ts
└── src/types/{api.generated.ts (generated), index.ts}
```

## Placement procedure
1. shadcn primitive → `components/ui/` (do not edit; wrap in `common/`).
2. Reusable widget → `components/common/`. One page's UI piece → `components/pages/[feature]/`.
3. Stateful container for one page → `components/views/[feature]/[Feature]View.tsx`.
4. Endpoint path → `lib/api/routes.ts`. Raw async call → `fetchers.ts`. Keys + `queryOptions` + hooks → `queries.ts`.
5. Zod form schema → `lib/validators/`. Response/request types → generated `types/api.generated.ts`.
6. Zustand store → `lib/store/` only when state is shared across distant components (ids, not server objects).
7. Anything TV → `src/tv/**` (or `src/lib/timer/`) and owned by tv-dev.

## Naming
Component files PascalCase; `use[Name].ts`; `[feature]Store.ts`; query keys `[feature]Keys`, options
`[feature]Queries`; route folders kebab-case; `export default` for components/pages, named exports elsewhere.
Import order: React/Next → third-party → `@/components` → `@/lib` → `@/types` → relative.

## Handoff
Fetchers/queries/state → `client-data-state`. TV rendering, animation and resilience → `tv-rendering`.
