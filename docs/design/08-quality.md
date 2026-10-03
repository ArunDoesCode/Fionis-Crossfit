# 08 Quality: performance, failure modes, testing, delivery

## Performance budgets

| Area | Budget |
|---|---|
| Member app cold start to Today (from cache) | < 1.5 s on iPhone 12-class and mid-range Android |
| Member write round trip (submit result) | p95 < 500 ms server time |
| Write → TV visible | < 1.5 s end to end |
| TV frame rate | 60 fps on N100 mini PC; ≥ 30 fps in `?perf=low` on Fire Stick 4K |
| API p95 (reads) | < 200 ms server time |
| `computeBoard` for 60 athletes | < 20 ms |
| Member bundle | track size in CI; fail on > 15% regression |

Techniques: cached-first member app, no sockets on phones, API co-located with DB, narrow selects and cursor pagination, transform/opacity-only TV animation, debounced board renders (250 ms), Web Animations API for credits.

## Failure modes and mitigations

| Risk | Mitigation |
|---|---|
| Double submit / retry / flaky wifi | `Idempotency-Key`, unique `(session_id, member_id)`, offline mutation queue |
| Concurrent submits | Per-session advisory lock in one transaction |
| Invalid state jump | API state machine + DB transition guard |
| Typo results (43:20 vs 4:32) | Constrained inputs, echo confirm, hard validation, outlier confirm + flag |
| Wrong session check-in | Token window, confirm screen names the session |
| Forgot to scan | Trainer adds attendance; member can submit afterward |
| Trainer forgets END | `auto-end` job |
| Accidental START/END | Undo within 5 min |
| Result corrected | `official_*` vs `submitted_*`, reason required, audit log, PR/award recompute and revoke |
| Workout edited after use | Locked + versioned |
| TV offline or stale | Snapshot + Realtime + events fallback, reconnect pill, watchdog reload, admin shows TV online |
| Missed/duplicate TV animation | Event ids, dedupe, scenes derived from snapshot |
| Old app version | `minAppVersion` gate, 426 |
| Push not delivered | TV still shows pending list + QR; push is an aid |
| Service outage | `/healthz`, Sentry alerts, Supabase backups (enable PITR on paid plan) |
| RLS/authz mistakes | pgTAP tests + API integration tests per role |

## Testing

| Layer | Tooling | Must cover |
|---|---|---|
| `packages/domain` | Vitest, table-driven | scoring/sort/format, timer (all modes and boundaries), baseline/index, board ordering + tie-breaks, PR, streaks (week edges, freeze, timezone), achievements incl. revocation, validation/outliers |
| `packages/contracts` | Vitest | schema round-trips, example payloads |
| DB | pgTAP (`supabase/tests`) | transition guard, RLS per role, unique/check constraints |
| API | Vitest + local Supabase | full class flow; idempotency replay; concurrency (parallel submits); correction recompute; role guards |
| TV | Vitest (reducer, queue), Playwright (lab scenes + screenshots) | event handling, overlay queue, reconnect, pagination |
| Admin | Playwright | create workout, run session, correct result |
| Member | Maestro | sign-in, check-in, submit, offline submit, history |

Golden fixtures: `packages/domain/fixtures/` holds recorded classes (attendees, histories, expected boards and awards) used by domain, API and TV mock scenarios, so all layers agree.

## CI (GitHub Actions)

1. install (pnpm cache) → lint → typecheck → unit tests.
2. `supabase start` → `db reset` → pgTAP → API integration tests.
3. Playwright against built web (lab scenes).
4. On tag: build API image, deploy to staging; EAS build/preview profile.

## Environments and config

- `local`, `staging`, `prod`. Each has its own Supabase project and API deployment.
- API env (zod-validated): `DATABASE_URL` (pooler), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` or JWKS URL, `EXPO_ACCESS_TOKEN` (optional), `SENTRY_DSN`, `PUBLIC_WEB_URL`, `ALLOWED_ORIGINS`.
- Web env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`.
- Member env (EAS): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`.
- Accounts needed before beta: Apple Developer ($99/yr), Google Play ($25 once), Sentry, Fly.io or Railway, Vercel, Supabase.

## Definition of done (every task)

- Acceptance criteria in `TASKS.md` met.
- `pnpm lint && pnpm typecheck && pnpm test` green; `pnpm db:test` if SQL changed.
- New endpoint has contract schema, integration test, and entry in `docs/04-api.md` if it deviates.
- No new `any`, no hardcoded tokens/strings, no secrets.
