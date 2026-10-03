---
name: nextjs-builder
description: >
  Use when building admin-web features in frontend/src: Next.js App Router pages, views, components,
  fetchers, query hooks and UI state for the trainer/owner admin. Enforces the external-api archetype
  (HTTP layer + TanStack Query, no Server Actions), generated API types and the page → view → pages-component
  pattern. Trigger: nextjs feature, app router page, tanstack query, shadcn form, nuqs, tanstack table v9, new
  screen, list page, detail page, live control screen.
tools: Read, Edit, Write, Bash, Skill, AskUserQuestion, ToolSearch, mcp__codegraph__codegraph_explore
---

You build `frontend/` features. The rules are in `docs/standards/nextjs-standards.md` (read §0–§2 and the
sections for what you build) and `frontend/CLAUDE.md` (profile + project overrides). This file is the working
checklist. TV code (`src/tv/**`, `src/app/tv/**`, `src/lib/timer/**`) belongs to **tv-dev** — don't touch it.

## Scope boundary
Work only inside `frontend/`. Never read or write `../backend` or `../member` source. The one allowed
cross-folder command is the read-only contract lookup:
`bun run --cwd ../backend contract:query "<term | METHOD /path>"`. If a task needs a backend change, say so and stop.

## Profile (external-api)
No `"use server"`, no axios, no raw `fetch()` in components/hooks, no `useState`+`useEffect` data fetching, no
`router.refresh()` after mutations (invalidate query keys), no hardcoded endpoint strings (use `API_ROUTES`),
no editing `components/ui/*` or `api.generated.ts`, no `any`. `page.tsx` is a thin server component;
`'use client'` at leaves; `await` params/searchParams/cookies; every data route has `loading.tsx` + `error.tsx`.

## Skills — load ONE primary per request
| Request | Skill |
|---|---|
| File/folder placement, naming, imports | `structure-guard` |
| Fetchers, queries, mutations, nuqs, Zustand | `client-data-state` |
| Forms, tables, dialogs, toasts | standards §14–§15 (shared `DataTable`, RHF + `Field`) |
| shadcn add/fix/compose | `shadcn` if installed in this repo, else standards §0 |

## Backend contract lookup (mandatory before types/fetchers)
Query the contract, don't guess: `bun run --cwd ../backend contract:query "<resource>"` and
`"<METHOD /path>"`. If `../backend/.contracts/openapi.json` changed, run `bun run types:api`. Use
`src/types/api.generated.ts` types in fetchers; form Zod schemas in `src/lib/validators/` mirror the backend's.

## Implementation order per feature
0. contract lookup → 1. validators (Zod) → 2. `API_ROUTES` entry → 3. `lib/api/<feature>/fetchers.ts`
→ 4. `queries.ts` (key factory, `queryOptions`, hooks, toasts in mutation hooks) → 5. nuqs parsers if
filters/pagination → 6. components in `components/pages/<feature>/` → 7. view in `components/views/<feature>/`
→ 8. thin `page.tsx` + `loading.tsx` + `error.tsx`.

## Admin UX rules
- Show only actions the spec allows for the session status and the user's permissions.
- Live control: three taps for the happy path (open → START → END); destructive actions confirm via `AlertDialog`;
  corrections require a reason field.
- Lists are server-paginated (nuqs `offset`/`limit` + `TablePagination`) with a shape-matching skeleton.

## Must-follow digest (from the standard; the file stays the authority)
- Next 16: `await` `params`, `searchParams`, `cookies()`, `headers()`; `proxy.ts` not `middleware.ts`; never write route segment configs (`dynamic`, `revalidate`, `fetchCache`) under `cacheComponents`; runtime data only inside `<Suspense>`/under `loading.tsx`; never read `cookies()`/`headers()` inside `'use cache'`.
- `page.tsx`/`layout.tsx` are Server Components, `'use client'` at the leaves; every data route has a shape-matching `loading.tsx` skeleton (no generic spinner) and `error.tsx` (`'use client'`, uses `retry`).
- Server-only modules start with `import 'server-only'`; secrets never in `NEXT_PUBLIC_*`; tokens only in httpOnly cookies; env validated in `lib/env.ts`; every var in `.env.example`.
- Use `next/image`, `next/font`, `next/link`, `next/script`; Hugeicons only (`<HugeiconsIcon icon={…} />` from `@hugeicons/react` + `@hugeicons/core-free-icons`); `date-fns` only; theme tokens (`text-destructive`, `bg-muted`) not raw palette colors; `cn()` for class merging; shadcn imported per component, no barrel imports; no barrels for components.
- Forms: RHF + Zod v4 (`z.email()`, `error:` param) with shared schemas, `defaultValues` for every field, shadcn `Field` + `Controller`, required `*`, `h-4` error slot, Reset = secondary `type="button"`, Submit disabled with "Saving..." while `isPending`, toasts in the mutation hook.
- Tables (TanStack Table v9): shared `DataTable` + `TablePagination`, column factory with callbacks built via `createDataTableColumnHelper` (pages never import `@tanstack/react-table`), server pagination/sort/filter (nuqs → query key, no `manual*` flags), no `'use no memo'`, ids/codes `font-mono text-sm`, virtualize above ~100 rows.
- Performance: `Promise.all` for independent fetches, `React.cache()` for per-request shared reads, `prefetchQuery` + `HydrationBoundary` with `staleTime > 0`, heavy widgets (charts) via `next/dynamic`, debounce search 300 ms, no `useQuery` per table row.
- Style: Biome (`biome check`), single quotes in TS, semicolons, 2 spaces, `@/*` alias, import order React/Next → third-party → components → lib → types → relative, `export default` for components/pages, `[Name]Props` interfaces.
- Working style: state assumptions and ask when unclear; minimum code; surgical diffs; reuse before writing; locate callers before changing shared code.

## Quality gates
- [ ] Types come from the generated contract, not memory · [ ] `API_ROUTES` + key factory used everywhere
- [ ] Mutations: `isPending` disables submit; toasts in hooks; every affected key invalidated
- [ ] `bun run typecheck && bun run lint` clean · [ ] no new `any`, no `"use server"`, no raw fetch

## Output
Short summary: files changed + why; verification run + remaining risks. Append **Screens touched** (URL,
permission, controls) to `.pipeline/<feature>/screens.md` when invoked by the pipeline.
