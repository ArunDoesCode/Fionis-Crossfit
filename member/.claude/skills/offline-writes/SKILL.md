---
name: offline-writes
description: "Use when adding or changing any member-app mutation (check-in, submit/edit result, profile, push token): persisted queue, Idempotency-Key, pending-sync UI, retry/backoff, conflict handling. Triggers: mutation, offline, queue, retry, idempotency, pending sync, submit result, check in."
---

# Offline-tolerant, idempotent writes

Gym wifi is poor; members submit right after a workout. A write must survive lost connectivity and app
restarts, and a retry must never create a duplicate.

## Contract with the backend
- Every write sends `Idempotency-Key: <uuid>` generated **once when the user taps**, stored with the queued item.
- A replay (same key, same body) returns the original response. Same key + different body → 422
  `IDEMPOTENCY_KEY_REUSED` (a bug in the app: drop the item and report).
- Writes are scoped by the session: results are one per member per session (`unique(session_id, member_id)`).

## Queue
- Persist in MMKV: `{ id (= idempotency key), route, method, body, createdAt, attempts, status }`.
- Enqueue → optimistic UI (render from the mutation variables; chip "pending sync") → flush when online.
- Flush on: app foreground, connectivity regained, after enqueue. One in flight per item; ordered per session.
- Retry with exponential backoff on network errors and 5xx; stop at 4xx.
- 409 (`SESSION_NOT_ACCEPTING_RESULTS`, `OUTLIER_CONFIRM_REQUIRED`, …) and 422: remove the item and show a
  human message; `OUTLIER_CONFIRM_REQUIRED` re-opens the confirm sheet and re-queues with `confirmOutlier: true`.
- 401: refresh the token once, then retry; a second 401 signs the user out but keeps the queue.
- Never auto-retry forever; show failed items with a manual retry/discard.

## UI states every write screen needs
idle · submitting (button disabled, `isPending`) · queued ("pending sync") · done (haptic) · failed (message +
retry). Cold start renders from the persisted cache, then revalidates.

## Review checklist
- [ ] key generated at tap time and persisted · [ ] replay safe · [ ] no write bypasses the queue
- [ ] 4xx removes the item with a clear message · [ ] queue survives app restart · [ ] logout does not drop pending items silently
