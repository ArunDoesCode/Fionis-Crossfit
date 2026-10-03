---
name: tv-rendering
description: "Use when building or reviewing the gym TV display in frontend/src/tv: scenes, ring timer, live leaderboard, achievement overlay and queue, credits roll, mock lab, SSE/snapshot wiring, reconnect behaviour, animation performance. Triggers: tv, display, kiosk, leaderboard animation, achievement overlay, credits, ring timer, lab, scenario player, sse, snapshot, perf mode."
---

# TV rendering rules (project override of the Next.js standard)

Design intent: `docs/design/05-tv-spec.md` (input to specs; the frozen `tv-*` specs win on conflict).

## Data flow
1. Boot: `GET /v1/tv/snapshot` → TanStack Query cache (`TvState`, includes `lastEventId`, `serverNow`).
2. Stream: `EventSource` on the SSE URL from `API_ROUTES` with `Last-Event-ID`; dedupe by event id; ignore
   `id <= lastAppliedId`; on a gap call `GET /v1/tv/events?after=`.
3. Events that carry full records (`board_updated`, `phase_changed`) → `setQueryData` on the snapshot.
   Transient events (`achievement`, `result_submitted`, `checkin`) → a per-provider Zustand store
   (`createTvStore` + provider): achievement queue, row flash flags, toasts. No module-level singleton.
4. Scene = f(`session.status`, snapshot). Never from event order. Events only add transient effects.
5. Reconcile every 30 s (refetch snapshot; replace if `lastEventId` or board hash differs). Reconnect with
   backoff 1 s → 30 s. After 10 s silent show the reconnect pill but **keep the last scene**. Heartbeat
   `POST /v1/tv/heartbeat` every 15 s. Watchdog reload after 5 min without a good snapshot and every ~6 h when idle.
6. Clock: `offset = serverNow - Date.now()` from the snapshot; timers use `Date.now() + offset`.

## Rendering
- Design at 1920×1080 and scale with one root transform. Minimum text 28 px. No scrolling except the credits.
- Animate only `transform` and `opacity` (plus the ring's SVG stroke offset). Never animate blur, filter or
  large box-shadows. Layout animations via `motion` `layout`; credits via the Web Animations API (compositor).
- `?perf=low` (and auto-switch when frame time > 24 ms for 3 s): halve particles, no confetti/glows.
- Particle budget: ≤ 80 for gold, ≤ 20 for silver, none for bronze; always clean up canvases/rAF/timers/audio.
- Tokens from `src/tv/theme.ts` only (tier colors, accent, durations, springs). No literals in components.
- `RingTimer` and friends are presentational: they take a `TimerState` from `src/lib/timer/` and compute nothing.
- The TV never computes ranks, awards, deltas or display text — it renders the API's `BoardRow`/`TvAward`.

## Scenes (by `session.status`)
none/closed/cancelled → Ambient · scheduled → Gather (WOD + QR + check-ins) · active → Workout (countdown, ring,
WOD list) · collecting → Live board (+ achievement overlay) · results → Credits (podium, roll) → Ambient.
Cross-fade 600 ms between scenes; never a hard cut.

## Achievement overlay and queue
One at a time; priority tier (legend > gold > silver > bronze) then code priority; dedupe by award id;
max 8 queued, overflow merged into "+N more"; `achievement_revoked` removes queued items; durations 3.5/4.5/
5.5/7 s with 400 ms gaps. Overlays only in `collecting`/`results`; check-in awards in `scheduled` are corner toasts.

## Lab and mock harness (build first)
`/tv/lab`: scene switcher, event buttons, scenario player (`full-class-18`, `small-class-6`, `big-class-30`,
`emom-12`, `tabata`, `for-time-capped`), speed control, low-perf toggle. The player feeds the **same**
reducer/cache setters as production; only the event source differs. `?mock=<scenario>` runs `/tv` offline.
Every scene must be viewable in the lab before it is wired to live data.

## Checks before finishing
- [ ] Scene renders at 1080p and 4K for 6, 18 and 30 athletes · [ ] kill-network test holds the scene and
reconciles without duplicate overlays · [ ] only transform/opacity animated · [ ] listeners/timers cleaned up
· [ ] `bun run typecheck && bun run lint && bun test` clean.
