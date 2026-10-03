# 02 Domain rules (implemented in `packages/domain`)

All functions are pure. `now` is always an argument. Every rule below needs table-driven tests.

## 1. Session state machine

```text
scheduled ──START──▶ active ──END──▶ collecting ──▶ results ──▶ closed
     └──────────────CANCEL (admin, before active)──▶ cancelled
```

| Transition | Trigger | Side effects |
|---|---|---|
| scheduled → active | trainer START | `started_at = now + timer.countdown_s` (the official zero); emit `phase_changed` |
| active → collecting | trainer END, or job at `ends_at` (see below) | `ended_at = now`; `collect_until = now + gym.collect_minutes`; emit `phase_changed`, `board_updated` (all attendees pending); push "Enter your result" |
| collecting → results | all attendees submitted, or `collect_until` passed, or trainer "Show results" | run session awards; emit `board_updated`, `achievement`*, `phase_changed` |
| results → closed | `results_minutes` (default 15) elapsed, or trainer | emit `phase_changed` |
| undo | trainer, within 5 min of the transition | `active → scheduled` (clear `started_at`); `collecting → active` (clear `ended_at`, `collect_until`) |

Auto-end job: for `active` sessions, end when `now >= started_at + autoEndAfter(timer)`; `autoEndAfter` = cap/duration/total interval time plus 5 minutes grace.

Late submissions are accepted while status is `collecting` or `results`; they recompute the board and emit events. Member may edit own result while status is `collecting|results` and result status is `submitted` (not `corrected`).

## 2. Score encoding

| scoring_t | `value` | `extra` | Direction | Notes |
|---|---|---|---|---|
| time | seconds (finished) | reps completed if capped | lower better | `finished=false` means capped |
| amrap_reps | total reps | unused | higher | |
| rounds_reps | full rounds | extra reps | higher | |
| load | kg | unused | higher | step 0.25 |
| reps | reps | unused | higher | |
| distance | meters | unused | higher | |
| calories | calories | unused | higher | |

`scoreSort(type, finished, value, extra) -> number`, higher is always better:
- time finished: `10_000_000 - value`
- time capped: `extra` (always below any finished time since `value < 10_000_000`)
- rounds_reps: `value * 10_000 + extra`
- others: `value`

Formatting: time `m:ss` (and `h:mm:ss` over 1 hour), rounds_reps `R+N`, load `kg` with up to 2 decimals trimmed, capped `CAP +N`.

## 3. Submission validation (`validateSubmission`)

Hard errors (422): value not finite or ≤ 0; time finished and cap exists and `value > cap`; time finished `value < 20s`; load `> 500`; reps/calories/distance above configured sanity max; `finished=false` on a workout without a cap; division not in `workout.divisions`; member not in `attendance`; session status not `collecting|results`.

Outlier (409 `OUTLIER_CONFIRM_REQUIRED` unless request has `confirmOutlier: true`): baseline exists and `abs(perfIndex) > 0.40`. Confirmed outliers are stored with `flag='outlier'` and shown in admin Exceptions.

## 4. Baseline and performance index

```text
priorResults = official results of member
               where benchmark_id = workout.benchmark_id (not null)
                 and division = result.division
                 and status != 'excluded'
                 and finished = true           (time workouts)
                 and session != current
                 and achieved within last 365 days
baseline     = median(last 3 by achieved_at)   if count >= 2 else null
perfIndex    = time:   (baseline - today) / baseline
               others: (today - baseline) / baseline
```

- No `benchmark_id` or no baseline → `perfIndex = null`.
- Capped today → `perfIndex = null` (v1 default).
- Division with no matching history → null.
- Ranking uses the raw `perfIndex`; UI bars clamp display to ±30%.

## 5. Board computation (`computeBoard`)

Input: workout, attendees, results (official values), per-member history. Output: `BoardRow[]` (one row per attendee, including pending).

Row ordering in `perfRank` order:
1. **Ranked**: athletes with `perfIndex`, sorted by `perfIndex` desc, tie → better `scoreSort`, tie → earlier `submittedAt`. Assign `perfRank` 1..n.
2. **Unranked with a result** (no baseline, capped, or one-off): sorted by `scoreSort` desc within division order (Rx first). `perfRank = null`.
3. **Pending** (attendee without result): sorted by check-in time.

`rawRank`: per division, by `scoreSort` desc, ties broken by earlier `submittedAt`.

Excluded results are treated as pending-with-flag (not ranked).

Row fields: see `docs/04-api.md` `BoardRow`. `deltaText` examples: `-16s`, `+5 kg`, `+3 reps`.

## 6. PR detection (`detectPr`)

- `BASELINE_SET`: no prior official finished result for same benchmark + division.
- `PR`: prior best exists and today strictly better by `scoreSort`, finished only.
- Capped results never PR.
- Output includes `prevBest`, `newBest`, `delta` for display (`Fran 4:18 → 4:02`, `-16s`).

## 7. Streaks (`computeStreak`)

- Week = ISO week (Mon–Sun) in `gym.timezone`.
- A week qualifies if attended sessions ≥ `gym.streak_min_sessions` (default 3).
- Streak = consecutive qualifying weeks ending at the current week if it already qualifies, else ending at the last completed week (an in-progress week never breaks the streak).
- Freeze: one missed week per rolling 90 days is auto-covered.
- `member_stats` caches `sessions_total`, `streak_weeks`, `best_streak`, `freezes_used`.

## 8. Achievements

Definitions are data (`achievement_defs`), evaluation is code (`packages/domain/achievements`). Three evaluators:

| Evaluator | When | Inputs |
|---|---|---|
| `evaluateCheckinAwards` | after check-in | member stats before/after |
| `evaluateResultAwards` | after each result insert/edit | result, prior history, board |
| `evaluateSessionAwards` | at collecting → results | final board |

Catalog (MVP):

| code | tier | rule | TV text |
|---|---|---|---|
| `PR` | gold | `detectPr` = PR | "PERSONAL RECORD" + `old → new` |
| `BASELINE_SET` | bronze | first attempt at a benchmark | "BASELINE SET" |
| `PODIUM_1` / `PODIUM_2` / `PODIUM_3` | gold / silver / bronze | perfRank 1/2/3 at session end, needs ≥ 3 ranked athletes | "TOP PERFORMER #n" |
| `MOST_IMPROVED` | gold | highest positive `perfIndex` ≥ 5% at session end | "MOST IMPROVED" + `+x%` |
| `RAW_WINNER` | silver | rawRank 1 per division at session end, needs ≥ 3 in division | "FASTEST RX" / "FASTEST SCALED" (by scoring type: "MOST REPS", "HEAVIEST") |
| `STREAK_4/8/12/26/52` | silver/silver/gold/gold/legend | `streak_weeks` reaches N | "N-WEEK STREAK" |
| `SESSIONS_10/25/50/100/250/500` | bronze/bronze/silver/gold/gold/legend | `sessions_total` reaches N | "N SESSIONS" |
| `COMEBACK` | bronze | check-in after ≥ 30 days without attendance | "WELCOME BACK" |

- One award per (member, code, session). Awards are idempotent.
- **Revocation**: when a trainer correction or exclusion changes a result, re-run evaluators for that result/session; awards no longer earned get `revoked_at`; newly earned ones are inserted. Revoked awards are removed from credits; TV receives `achievement_revoked`.
- TV priority: legend > gold > silver > bronze; within tier `PR` > `PODIUM_*` > others.

## 9. Timer model (`timerState`)

```ts
type TimerConfig =
  | { mode: 'for_time'; countdownS: number; capS: number | null }
  | { mode: 'amrap'; countdownS: number; durationS: number }
  | { mode: 'emom'; countdownS: number; rounds: number; intervalS: number }
  | { mode: 'intervals'; countdownS: number; phases: { label: string; workS: number; restS: number; rounds: number }[] };

type TimerState = {
  phase: 'pre' | 'countdown' | 'work' | 'rest' | 'finished';
  label: string;              // "WORK", "REST", phase label, "GO"
  round: number | null;       // 1-based
  totalRounds: number | null;
  elapsedS: number;           // since zero, clamped >= 0
  remainingS: number | null;  // in current phase (or to cap/duration)
  progress: number;           // 0..1 of current phase (or of cap/duration)
  countdownRemainingS: number | null;
  finished: boolean;
};

timerState(config, startedAtMs /* the zero */, nowMs): TimerState
```

Semantics:
- `nowMs < startedAtMs`: `phase='countdown'`, `countdownRemainingS = ceil((startedAtMs - nowMs)/1000)`.
- `for_time`: counts up; if cap, `progress = elapsed/cap`, `finished` at cap; `remainingS` to cap (null if no cap).
- `amrap`: counts down from `durationS`.
- `emom`: each round is `intervalS`; `remainingS` within the interval; `round` increments; finishes after `rounds`.
- `intervals`: iterate phases in order; each phase repeats `rounds` times as work then rest (rest may be 0, skip it). Pomodoro-style.
- Workout `movements[].atRound` (optional) maps a movement to an EMOM round / interval phase index so the TV can highlight the active step.

## 10. Edge cases

| Case | Behavior |
|---|---|
| Member submits without attendance | 403 `NOT_CHECKED_IN`; trainer must add attendance |
| Duplicate request | Idempotency key returns the stored response |
| Two submits at once | Serialized by session advisory lock |
| Workout edited after use | Locked; new version row created; history unaffected |
| Division change on next attempt | No baseline for new division; `BASELINE_SET` if first in that division |
| Corrected result changes old PR | `recompute_member_benchmark` rebuilds PR awards after that point; revoke/insert as needed |
| Session cancelled | No board, no awards |
| Empty class | `results` skipped; session closes directly |
| `show_on_board=false` | Counted, displayed as "Athlete", excluded from ranking display on others' devices but still ranked internally; their own app shows their real rank |
| Trainer forgets END | Auto-end job |
