# 05 TV spec (`apps/web` route `/tv`)

The TV is the main interaction surface. It is read-only, highly animated, and must never show a blank screen.

## Principles

1. **State from snapshots, animation from events.** Scenes derive from `session.status` in the store. Events only trigger transient effects (flashes, overlays, count-ups). Missing an event never leaves the wrong scene.
2. **One store** (Zustand + pure reducer `applyEvent(state, event)`), unit-tested.
3. **Design at 1920×1080**, scaled with a single root transform to any resolution. All sizes in design px; no scrolling except the credits.
4. **Only animate `transform` and `opacity`** (plus SVG stroke offset on the timer ring). No animated blur/box-shadow/filter. Keeps 60 fps on weak hardware.
5. **Perf mode** (`?perf=low` or auto when frame time > 24 ms for 3 s): halve particles, disable confetti and glows, simplify shadows.
6. **Mock everything first** (`/tv/lab`, below) so scenes are developed and reviewed without a backend.

## Data sources and resilience

- Boot: `GET /v1/tv/snapshot` → store. Then subscribe to Supabase Realtime `postgres_changes` INSERT on `tv_events` with filter `gym_id=eq.<gymId>`.
- Clock: `clockOffset = snapshot.serverNow - Date.now()`; all timer math uses `Date.now() + clockOffset`.
- Apply events in id order; ignore `id <= lastAppliedId`; if a gap is detected call `GET /tv/events?after=`.
- Reconcile: every 30 s refetch snapshot; if `lastEventId` differs from the store or hash of board differs, replace state.
- Reconnect with exponential backoff (1 s → 30 s). After 10 s without any heartbeat/Realtime signal show a small "reconnecting…" pill; keep the last scene rendered.
- `POST /v1/tv/heartbeat` every 15 s.
- Watchdog: full page reload if no successful snapshot in 5 min, and every 6 h at a quiet moment (status `closed`/idle).
- Auth: TV signs in once with a dedicated `display` user (`/tv/login`), refresh token persisted; auto-refresh.
- Audio: Web Audio API. Kiosk launched with `--autoplay-policy=no-user-gesture-required`; otherwise a one-time "Tap to enable sound" overlay.

## Theme and typography

- Dark, high contrast, one neon accent from `gym.accent` (default electric lime) plus tier colors: bronze `#CD7F32`, silver `#C0C8D4`, gold `#FFC933`, legend gradient (violet → magenta → gold). Tokens in `packages/ui-tokens`.
- Display font: bold condensed sans (for example Barlow Condensed / Oswald), self-hosted and preloaded. Numbers use tabular-nums.
- Minimum text size 28 px at 1080p (readable across the gym).

## Scenes (selected from `session.status`)

| status | Scene |
|---|---|
| none / `closed` / `cancelled` | **Ambient** |
| `scheduled` | **Gather** (WOD + QR + check-ins) |
| `active` | **Workout** (timer + WOD) |
| `collecting` | **Live board** (leaderboard that updates as results arrive) |
| `results` | **Credits** (podium then movie-style roll), then Ambient |

Transitions between scenes: 600 ms cross-fade + slight scale (0.98 → 1). Never hard cut.

### 1. Ambient
Rotates cards every 15 s (cross-fade): next class + WOD title; recent PRs wall (`ambient.recentPrs`, 5 rows, staggered entry); weekly attendance leaders; featured benchmark top 5. Clock and gym logo in a corner. If no data for a card, skip it.

### 2. Gather (`scheduled`)
- Left: **WOD of the day**: title, scoring chip, time cap/format chip, full movement list (large), benchmark badge if any.
- Right: **QR** (value `session.checkinUrl`, white quiet zone, 360 px) with "SCAN TO CHECK IN".
- Bottom: attendee strip. On `checkin` event a circular chip (avatar or initials) springs in from the QR toward the strip; counter "12 checked in" ticks. Strip wraps to 2 rows, then compresses.
- Check-in awards (`COMEBACK`, streak, sessions milestones) show a **corner toast** (tier icon + text, 4 s), not the full overlay.
- When `startsAt - now < 5 min` show "STARTS IN mm:ss" pill.

### 3. Workout (`active`)
- **Countdown** (`now < startedAt`): full-screen numerals 10…1 (last 3 scale up with a pulse), then "GO" (0.8 s). Beeps at 3, 2, 1 (short) and GO (long).
- **Layout** (after zero):
  - Left 42%: **ring timer**. SVG circle, stroke offset driven by `timerState.progress`; ring color: accent → amber in last 25% → red pulse in last 10 s. Center: giant digits (`remainingS` or `elapsedS` by mode), label above ("WORK", "REST", "ROUND 3/8", "AMRAP", "FOR TIME"), sub-label below (cap, next phase).
  - Right 58%: **WOD card**: title, movement list with large type. For `emom`/`intervals`, movements with `atRound` highlight as the active step (sliding highlight bar, completed steps dim, upcoming steps normal). For others all steps equal.
  - Bottom strip: athlete avatars "18 on the floor".
- Audio: phase change beep (intervals/emom), last-3-seconds beeps, end buzzer at finish/cap. Volume from `gym.brand.tvVolume` (0–1).
- Timer math: `timerState(config, startedAt, now)` from `packages/domain`. Text updates at 10 Hz; ring at up to 30 fps via `requestAnimationFrame`.
- When the timer finishes (cap/duration) and status is still `active`, show "TIME" and wait for trainer END (auto-end job handles forgetfulness).

### 4. Live board (`collecting`)
The leaderboard table is rendered immediately with **every attendee**, then re-ranks live as results come in.

- Header: workout title, "WAITING ON n", progress bar `submitted/attendees`, countdown to `collect_until`.
- Table columns: `#` (perf rank), athlete (avatar, name, division chip), result (`valueText`), vs usual (`deltaText` chip, green/red, with mini bar clamped ±30%), raw rank (small), badges (tier icons).
- Order = `board` order from the API (ranked by perf, then unranked with result, then pending). The TV never re-sorts.
- **Row states:**
  - `pending`: dimmed, name + shimmering "waiting…" dots.
  - `just submitted` (on `result_submitted`): row lifts (scale 1.03) with accent glow for 1.5 s, result count-up from 0 (or from `0:00`) over 700 ms, then the row **slides to its new position** via layout animation (spring: stiffness 260, damping 28), rows it passes shift with the same spring.
  - Rank change: small ▲/▼ with number for 3 s.
  - PR row: persistent trophy icon; `isPr` rows get a thin gold left border.
  - `corrected`: brief cyan flash.
- **Capacity:** target 12 rows at 1080p. If `n > 12`: row height compresses down to min 56 px; beyond that, pin top 3 + auto-paginate the rest every 8 s (FLIP between pages). Never scroll abruptly.
- **Two lenses:** a toggle pill "VS USUAL | RAW" auto-switches every 20 s (raw = order by `rawRank` within division, division sections). User interactions are not needed.
- **Achievement overlay** (next section) plays on top; the table keeps updating behind a 40% dim.
- A trainer "Show results" or timeout moves to Credits; late results still update the board store silently.

### 5. Achievement overlay
Triggered by `achievement` events while status is `collecting` (and `results` before credits start). Queue processed one at a time.

- Layout (centered, over dimmed backdrop): **trophy** (SVG, tier-colored) drops in with a shine sweep; **achievement name** in huge caps below (for example "PERSONAL RECORD"); **athlete name** below that; **subtitle** line (for example "Fran 4:18 → 4:02 (-16s)"); tier ribbon.
- Durations: bronze 3.5 s, silver 4.5 s, gold 5.5 s, legend 7 s. 400 ms gap between items.
- Effects by tier: bronze none; silver sparkles (20 particles); gold confetti burst (canvas-confetti, 80 particles) + soft camera shake 6 px; legend confetti + radial light rays (opacity-only).
- Sound: short chime per tier (assets under `apps/web/public/tv/sounds`, 4 files).
- Queue rules: sort by tier desc then code priority; dedupe by `award.id`; max 8 queued; overflow is collapsed into a single "+N MORE ACHIEVEMENTS" card; `achievement_revoked` removes queued items.
- During `scheduled` (check-in awards) use the corner toast instead. Never show overlays during `active`.
- Every shown award is also kept in the store list for Credits.

### 6. Credits (`results`)
Movie-credits roll built from the final `board` and `awards`. Built once on entering the scene (late results appear next time the board is shown in Ambient).

Sequence:
1. **Title card** (3 s): "TODAY'S RESULTS", workout title, date.
2. **Podium** (5 s): top 3 perf ranks on rising bars (spring), athlete name, `valueText`, `deltaText`. If fewer than 3 ranked, show raw top 3 instead and label "FASTEST".
3. **Roll** (scrolling, centered column, top/bottom 12% gradient fade mask), sections with large small-caps headings:
   - MOST IMPROVED (name, `+x%`)
   - PERSONAL RECORDS (name ..... benchmark `old → new`, `delta`)
   - STREAKS & MILESTONES
   - THE FULL ROLL: every athlete in `perfRank` order (unranked after, pending last as "NO SCORE"): `NAME ........ 4:02   -16s   Rx` with tier icons after the name.
4. **Closing card** (4 s): "SEE YOU TOMORROW", next session time.
5. Fade to Ambient.

Scroll mechanics: render one tall element; animate with the **Web Animations API** (`element.animate([{transform:'translateY(100vh)'},{transform:'translateY(-100%)'}], { duration, easing:'linear' })`) so it runs on the compositor. `duration = (contentHeight + viewportHeight) / speedPxPerS`, speed default 90 px/s at 1080p, minimum total roll time 25 s. Dotted leaders via CSS (`radial-gradient` repeating).

## Timer visuals (`RingTimer` component contract)

```ts
<RingTimer state={TimerState} accent="var(--tv-accent)" />
```
No time logic inside; purely presentational from `TimerState`. Storybook/lab covers each mode and phase.

## Lab and mock harness (`/tv/lab`, dev only)

- Scene switcher and event buttons (check-in, result, PR, gold award, legend award, late result, correction, phase changes).
- **Scenario player**: scripted timeline (JSON) that emits fake events into the same reducer as production. Built-in scenarios: `full-class-18`, `small-class-6`, `big-class-30`, `emom-12`, `tabata`, `for-time-capped`.
- Speed control (1×, 4×, 10×) and a "low perf" toggle.
- Same store and components as production; only the event source differs. `?mock=full-class-18` on `/tv` runs a scenario without backend.
- Playwright takes reference screenshots of each scene state from the lab for visual regression.

## Component list (`apps/web/src/tv/`)

`TvRoot` (scaler, scene router, store provider), `store/` (reducer, selectors), `scenes/{Ambient,Gather,Workout,LiveBoard,Credits}`, `components/{RingTimer,WodCard,QrPanel,AttendeeStrip,BoardTable,BoardRow,DeltaChip,TierIcon,Trophy,AchievementOverlay,CornerToast,Podium,CreditsRoll,ReconnectPill}`, `lib/{clock,audio,realtime,perf-monitor}`, `lab/`.

## Acceptance checklist (TV done when)

- All scenes render from `/tv/lab` with every built-in scenario at 1080p and 4K without layout breaks.
- Board reorders with layout animation for every event type; 30 attendees remain legible (pagination).
- Achievement queue shows tiers correctly, handles bursts of 10 without stalling, and never overlaps.
- Credits roll is smooth at 60 fps on the target mini PC and ≥ 30 fps with `?perf=low` on a Fire Stick 4K.
- Kill network for 60 s mid-session: scene holds, pill appears, state reconciles on return with no duplicate overlays.
- Unit tests: reducer, queue logic, timer text formatting; Playwright visual snapshots for lab scenes.
