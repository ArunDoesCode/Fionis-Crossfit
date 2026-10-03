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
TanStack Query v5, TanStack Table, nuqs, Zustand v5, RHF + Zod v4, Sonner, `lucide-react`, `date-fns`, `motion`
(TV), `canvas-confetti` (TV). User-facing text: typed dictionaries in `lib/messages/` if more than one language.

## Commands
```bash
bun run dev | build | typecheck | lint | fix | test
bun run types:api         # regenerate src/types/api.generated.ts from the backend contract
bun run e2e               # Playwright (TV lab scenes, admin flows) once added
```

## Env
`NEXT_PUBLIC_API_URL` (browser → backend), `API_URL` (server → backend). Documented in `.env.example`.
