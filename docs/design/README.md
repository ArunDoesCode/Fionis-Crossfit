# Design drafts (input to `/spec`, not specs)

Written on 2026-09-30 before the standards in `docs/standards/` were applied. Use them as raw material for
business rules, examples, screens and the TV experience. **Where they conflict with `docs/standards/*` or
`docs/decisions.md`, those win.** Known conflicts:

| Draft says | Now |
|---|---|
| pnpm/Turborepo monorepo with `packages/{contracts,domain,db,ui-tokens}` | one repo, sibling packages, no shared packages (D-002); domain code in `backend/src/lib/domain/` |
| Node runtime, Supabase Auth (OTP), Supabase Realtime, RLS for the display role | Bun, own JWT auth, SSE over `tv_events`, no RLS (D-003, D-004) |
| SQL migrations in `supabase/migrations` as schema truth | Drizzle schema is the only way to change the DB (standard §10) |
| error shape `{ error: { code, message } }`, cursor pagination | `{ success, data, meta }` / `{ success:false, message, code }`, `page`/`pageSize` (standard §4, §7) |
| `Idempotency-Key` header | kept (D-008) |
| `TASKS.md` task list | replaced by specs + `/feature`; M0 checklist in `docs/FOUNDATIONS.md` |

Files: `PLAN.md` (index, decision log — superseded by `docs/decisions.md`), `01-architecture.md`,
`02-domain.md` (**most reusable**: state machine, scoring, ranking, awards, timers), `03-data-model.md`,
`04-api.md`, `05-tv-spec.md` (**most reusable** for the TV specs), `06-member-app.md`, `07-admin-app.md`,
`08-quality.md`, `TASKS.md` (historic).
