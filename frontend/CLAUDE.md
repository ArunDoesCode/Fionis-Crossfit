# Frontend — CLAUDE.md (admin + TV)

Next.js 16 App Router. **The law is `../docs/standards/nextjs-standards.md`** — read §0–§2 and the sections
for what you build. This file declares the project profile and what is specific here (it overrides the
standard where it says so). Detailed how-to: `.claude/agents/nextjs-builder.md`, skills `structure-guard`,
`client-data-state`, `tv-rendering`.

```yaml
nextjs-profile:
  archetype: external-api
  backend: hono
  http: fetch                 # native fetch wrapper in lib/api/client.ts (+ server.ts forwarding cookies)
  auth: jwt-cookie
  cacheComponents: true
  pwa: false
  device-profile: default     # /admin ; /tv is a read-only display (see below)
```

## Not a monorepo
Separate folder with its own `package.json`, Biome config and lockfile. Nothing imported from `../backend`
or `../member`. The contract is the HTTP API: response types are **generated** from
`../backend/.contracts/openapi.json` with `bun run types:api` → `src/types/api.generated.ts` (never edit).
Zod form schemas live in `src/lib/validators/` and mirror the backend's; the backend re-validates.
Look up shapes with `bun run --cwd ../backend contract:query "<term | METHOD /path>"`.

## Two surfaces, two owners
| Surface | Paths | Agent |
|---|---|---|
| Admin (trainer/owner) | `src/app/(app)/admin/**`, `src/components/{views,pages,common}/**`, `src/lib/api/**` | frontend-dev |
| TV display | `src/app/tv/**`, `src/tv/**`, `src/lib/timer/**` | tv-dev |
| Public check-in fallback page | `src/app/checkin/**` | frontend-dev |

- Admin: standard external-api patterns. No Server Actions. TanStack Query + `API_ROUTES`. Live control polls
  `/admin/sessions/:id/live` every 5 s and refetches after each action.
- **TV** (project override, rules in skill `tv-rendering`): read-only. Snapshot via TanStack Query
  (`GET /tv/snapshot`); SSE events (`EventSource`, URL from `API_ROUTES`) update the cache with
  `setQueryData` when they carry full records, and push transient items (achievement queue, row flashes)
  into a Zustand store created per provider. Scenes derive from `session.status`. Only `transform`/`opacity`
  animations; `?perf=low`; every scene playable from `/tv/lab` with the mock scenario player (no backend).
  The TV signs in once with a `display` account (httpOnly cookie, auto-refresh).
- Timer maths: `src/lib/timer/` is a pure implementation tested against `tests/fixtures/timer-cases.json`
  (byte-identical to the backend copy; only test-writer edits it).

## Structure
Per the standard (§4): `app/` (thin server pages + `loading.tsx` + `error.tsx`), `components/{ui,common,pages,views}`,
`lib/{api,store,validators,searchParams.ts,providers.tsx,queryClient.ts,env.ts}`, `types/`. Extra: `src/tv/`
(`scenes/`, `components/`, `store/`, `lab/`, `theme.ts`) and `src/lib/timer/`.

## Stack
Bun, Biome (`biome check`), Tailwind 4 tokens, shadcn (`components/ui` never hand-edited — a hook blocks it),
TanStack Query v5, TanStack Table v9, nuqs, RHF + Zod v4 (Zustand v5 is not installed: the admin has no store; add it with the TV, D-0xx), Sonner, Hugeicons (`@hugeicons/react` `HugeiconsIcon` + `@hugeicons/core-free-icons`), `date-fns`, `motion`
(TV), `canvas-confetti` (TV). User-facing text: typed dictionaries in `lib/messages/` if more than one language.

## Commands
```bash
bun run dev | build | typecheck | lint | fix | test
bun run types:api         # regenerate src/types/api.generated.ts from the backend contract
bun run e2e               # Playwright (TV lab scenes, admin flows) once added
```

## Env
Same origin (D-018): `NEXT_PUBLIC_API_URL=/api` (a path, not a URL; the browser calls `/api/...` and `next.config.ts`
rewrites it to `API_URL`, so no CORS and first-party cookies). `API_URL` (internal address, ends in `/api`) is used by
server code (`lib/api/server.ts`) and by the rewrite, which is resolved at `next build`, so set it for the build too.
`/` is rewritten to `/admin` (no redirect round trip). Documented in `.env.example`.

## Overrides of the standard
- **member-records desktop-first (D-016 superseded, D-027…D-036; spec `docs/specs/member-records/ux.md` v2):** the laptop
  is the main device, phone is responsive. App shell = shadcn `Sidebar` (fixed left, content scrolls; ☰ drawer below 768 px).
  Forms use the owner's `FormField` → `FormItem min-h-19` → `FormControl` + `FloatingLabelInput` → `FormMessage`
  (nextjs-standards §14); no Reset button; main action in the header (desktop) / action bar (phone). Colours only as
  Tailwind classes from tokens in `globals.css` — no raw hex/oklch in components. Dates `dd MMM yyyy`, weeks start Monday,
  via `DatePicker`; every modal is a shadcn component; member search is `MemberSearch` over the cached directory.
  One source for each thing (tokens, nav items, back targets, formatter, form primitives): don't duplicate.
