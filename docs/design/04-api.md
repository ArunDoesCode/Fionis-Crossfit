# 04 API contracts

Base path `/v1`. JSON, camelCase. Auth: `Authorization: Bearer <Supabase JWT>`. All schemas are defined with zod in `packages/contracts` (names in backticks below). The API exports `AppType` for Hono RPC clients.

## Conventions

- **Idempotency:** every non-GET endpoint accepts header `Idempotency-Key` (uuid). Same actor + key + same request hash → returns the stored response. Same key + different body → 422 `IDEMPOTENCY_KEY_REUSED`. Required on member write endpoints; optional for admin.
- **Errors:** `{ error: { code, message, details? } }`.
- **Pagination:** cursor based, `?cursor=<opaque>&limit=<=50>`, response `{ items, nextCursor }`.
- **Time:** ISO strings; TV also receives `serverNow` epoch ms for clock offset.
- **Roles:** `M` member, `T` trainer, `O` owner, `D` display. Trainer includes owner unless stated.

### Error codes

`UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `VALIDATION_FAILED` 422, `NOT_CHECKED_IN` 403, `SESSION_NOT_ACCEPTING_RESULTS` 409, `INVALID_TRANSITION` 409, `OUTLIER_CONFIRM_REQUIRED` 409, `CHECKIN_WINDOW_CLOSED` 409, `CHECKIN_TOKEN_INVALID` 404, `WORKOUT_LOCKED` 409, `IDEMPOTENCY_KEY_REUSED` 422, `APP_UPDATE_REQUIRED` 426, `RATE_LIMITED` 429.

## Member endpoints (M)

| Method + path | Request | Response | Notes |
|---|---|---|---|
| `GET /me` | | `Me` {id,name,role,gymId,showOnBoard,…} | |
| `PATCH /me` | `{ name?, showOnBoard? }` | `Me` | |
| `GET /me/context` | | `MyContext` | Drives Today screen |
| `POST /check-in` | `{ token }` | `{ session, attendance, awards: AwardLite[] }` | Idempotent; token window: start−15 min … end + grace; emits `checkin` event and check-in awards |
| `POST /sessions/:id/result` | `SubmitResult` | `{ result, board: BoardRowSelf, awards: AwardLite[] }` | Validates via domain; 409 outlier unless `confirmOutlier` |
| `PATCH /results/:id` | `SubmitResult` (same shape) | same | Only own result, status `submitted`, session `collecting|results` |
| `GET /me/history` | `?benchmarkId&from&to&cursor&limit` | `{ items: HistoryItem[], nextCursor }` | |
| `GET /me/benchmarks/:id` | `?division` | `BenchmarkProgress` | series, best, latest, baseline, PRs |
| `GET /me/stats` | | `MemberStats` | streak, sessions, PR count, beat-usual rate |
| `GET /boards` | `?scope=today|week|month|alltime&benchmarkId&division` | `BoardList` | respects `showOnBoard` |
| `GET /me/achievements` | | `AwardLite[]` (not revoked) | |
| `POST /me/push-token` | `{ token, platform }` | `{ ok: true }` | |
| `GET /config` | | `{ minAppVersion, … }` | Client compares version; 426 on old app |

```ts
MyContext = {
  state: 'none'|'can_check_in'|'checked_in'|'in_progress'|'awaiting_result'|'submitted'|'missed',
  session: SessionLite | null,
  workout: WorkoutLite | null,
  myResult: ResultLite | null,
  checkinToken?: never,            // never sent to members
  next: SessionLite | null,
  serverNow: number
}

SubmitResult = {
  division: string,
  finished: boolean,
  value: number,                   // seconds | reps | kg | m | cal | rounds
  extra?: number,                  // capped reps | extra reps
  confirmOutlier?: boolean
}
```

## Admin endpoints (T unless noted)

| Method + path | Notes |
|---|---|
| `GET/POST /admin/workouts`, `GET/PATCH/DELETE /admin/workouts/:id` | PATCH on a locked workout → 409 `WORKOUT_LOCKED`; `POST /admin/workouts/:id/new-version` clones with version+1 |
| `GET /admin/benchmarks`, `POST /admin/benchmarks` | |
| `GET/POST/PATCH/DELETE /admin/templates` | |
| `GET /admin/sessions?from&to`, `POST /admin/sessions`, `PATCH /admin/sessions/:id` | assign workout, times |
| `POST /admin/sessions/:id/start` | active; sets `startedAt = now + countdown` |
| `POST /admin/sessions/:id/end` | collecting |
| `POST /admin/sessions/:id/show-results` | results |
| `POST /admin/sessions/:id/close`, `/cancel`, `/undo` | |
| `GET /admin/sessions/:id/live` | attendees, pending, board, flags (Live control) |
| `POST /admin/sessions/:id/attendance` `{ memberId }` | source `trainer` |
| `PATCH /admin/results/:id` `{ value, extra?, finished?, division?, status, reason }` | correction/exclusion; recompute + revoke awards; audit |
| `GET /admin/members`, `POST /admin/members` `{ name, email, role? }` (O) | creates auth user (no signup) + profile + sends OTP invite |
| `PATCH /admin/members/:id` (O) | role, status |
| `GET /admin/displays` | TV online status from heartbeat |
| `GET /admin/audit` | recent audit log |

## TV endpoints (D)

| Method + path | Response |
|---|---|
| `GET /tv/snapshot` | `TvState` |
| `GET /tv/events?after=<id>&limit=200` | `{ events: TvEvent[] }` fallback if Realtime misses |
| `POST /tv/heartbeat` | `{ ok: true }` (every 15 s) |

```ts
TvState = {
  serverNow: number,
  gym: { name: string, logoUrl?: string, accent?: string, timezone: string },
  session: null | {
    id: string, title: string, status: SessionStatus,
    startsAt: string, endsAt: string,
    startedAt: string | null, endedAt: string | null, collectUntil: string | null,
    checkinUrl: string,                               // https://<domain>/checkin?t=<token>
    workout: {
      title: string, description: string, scoring: Scoring,
      timer: TimerConfig, divisions: string[],
      movements: { order: number, name: string, reps?: string, load?: string, notes?: string, atRound?: number }[],
      benchmarkName?: string
    } | null
  },
  attendees: { memberId: string, displayName: string, avatarUrl?: string }[],
  board: BoardRow[],
  awards: TvAward[],                                   // non-revoked awards for the current session
  nextSession: { title: string, startsAt: string, workoutTitle?: string } | null,
  ambient: {
    recentPrs: { displayName: string, benchmarkName: string, prev: string, now: string, delta: string, at: string }[],
    weekAttendanceLeaders: { displayName: string, sessions: number }[],
    featuredBenchmark?: { name: string, top: { displayName: string, valueText: string, division: string }[] }
  },
  lastEventId: number
}

BoardRow = {
  memberId: string, displayName: string, avatarUrl?: string,
  division: string | null,
  status: 'pending'|'submitted'|'capped'|'excluded',
  valueText: string | null,          // "4:02", "CAP +12", "105 kg"
  value: number | null, extra: number | null,
  rawRank: number | null,
  baselineText: string | null,
  perfIndex: number | null,
  perfRank: number | null,
  deltaText: string | null,          // "-16s"
  isPr: boolean,
  awards: { code: string, tier: Tier }[],
  flag: 'outlier' | null,
  checkedInAt: string
}

TvAward = { id: string, code: string, tier: Tier, name: string, memberId: string, displayName: string,
            subtitle: string, payload: Record<string, unknown>, awardedAt: string }
```

### TV event catalog (`tv_events.type`, payload in `TvEventPayload` union)

| type | payload | TV effect |
|---|---|---|
| `phase_changed` | `{ sessionId, status, startedAt?, endedAt?, collectUntil? }` | scene switch (from status) |
| `checkin` | `{ sessionId, memberId, displayName, avatarUrl? }` | chip flies into attendee strip |
| `board_updated` | `{ sessionId, board: BoardRow[], reason: 'result'|'correction'|'finalize'|'init' }` | table re-renders with layout animation |
| `result_submitted` | `{ sessionId, memberId, displayName, valueText, deltaText?, late: boolean }` | row flash + count-up |
| `achievement` | `TvAward` | overlay queue (collecting), toast (scheduled) |
| `achievement_revoked` | `{ awardId, memberId, code }` | remove from queue/credits |
| `workout_changed` | `{ sessionId }` | TV refetches snapshot |
| `message` | `{ text, durationS }` | trainer banner (optional) |

Rules: event `id` is monotonic; TV dedupes and ignores `id <= lastAppliedId`. Emit events inside the same DB transaction as the state change.

## Write-path contracts (API internals)

`POST /sessions/:id/result` transaction order (must match):

1. Authenticate, load profile. Check idempotency key (return stored response if present).
2. `BEGIN`; `pg_advisory_xact_lock(hashtext(sessionId))`.
3. Load session, workout, attendance; `domain.validateSubmission`.
4. Upsert `results` (official = submitted; `score_sort` from `domain.scoreSort`).
5. Load history; `domain.computeBoard`; upsert `session_board`.
6. `domain.detectPr` → upsert `pr_events`; `domain.evaluateResultAwards` → insert `achievements_awarded` (skip existing).
7. Insert `tv_events`: `result_submitted`, `board_updated`, `achievement` per new award.
8. If all attendees have results and status is `collecting` → run the `collecting → results` transition (same transaction).
9. Store idempotency response; `COMMIT`.

`PATCH /admin/results/:id`: same lock; update `official_*`, `status`, `corrected_by`, `correction_reason`; recompute board; re-run award evaluators for this result and the session; revoke/insert; rebuild `pr_events` for member+benchmark+division; emit `board_updated(reason:'correction')`, `achievement`/`achievement_revoked`; write `audit_log`.

## Jobs (croner + advisory lock)

| Job | Schedule | Action |
|---|---|---|
| `auto-end` | every 15 s | end `active` sessions past `autoEndAfter` |
| `auto-results` | every 15 s | `collecting → results` at `collect_until` |
| `auto-close` | every 30 s | `results → closed` after `results_minutes` |
| `gen-sessions` | hourly | create next 14 days of sessions from templates (idempotent by template+date) |
| `class-reminders` | every 5 min | push "Class at HH:MM" 60 min before (to members with recent attendance pattern or all members, configurable) |
| `prune` | daily | delete `tv_events` > 7 d, `idempotency_keys` > 48 h |
| `stats-refresh` | hourly | recompute `member_stats` for members with new attendance |

Jobs call the same service functions as endpoints; all are idempotent.
