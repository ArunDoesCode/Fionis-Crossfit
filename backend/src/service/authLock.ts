import type { LockState } from "../types/auth.types";

// The one global sign-in lock (BR-REC-01, 28, 29, 171). Pure: no I/O, no clock, time is an argument.
// The state is the single `login_attempts` row; the service reads it under a row lock, applies one of
// these functions and writes the result back.

/** Wrong tries that start a lock: the 5th is still refused as a wrong try, the 6th is refused as locked. */
export const LOCK_AFTER_FAILED_TRIES = 5;
/** Tries older than this drop off the count (the window opens with the first wrong try). */
export const FAILED_TRY_WINDOW_MS = 15 * 60 * 1000;
/** How long a lock lasts; tries during it never extend it. */
export const LOCK_DURATION_MS = 15 * 60 * 1000;

/** A fresh install, a correct sign-in, or `bootstrap-admin --unlock`: nothing counted, not locked. */
export const CLEAR_LOCK: LockState = {
  failedCount: 0,
  windowStartedAt: null,
  lockedUntil: null,
};

export function isLocked(state: LockState, now: Date): boolean {
  return (
    state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime()
  );
}

/** Whole seconds until a new try is allowed, rounded up, never below 1 (BR-REC-29). Only for a locked state. */
export function retryAfterSeconds(state: LockState, now: Date): number {
  if (state.lockedUntil === null) return 1;
  return Math.max(
    1,
    Math.ceil((state.lockedUntil.getTime() - now.getTime()) / 1000),
  );
}

/**
 * The state after one wrong try at `now`. The caller has already refused the try if `isLocked`.
 * A lock that has ended, or a window older than 15 minutes, starts the count from zero (BR-REC-28).
 */
export function afterWrongTry(
  state: LockState,
  now: Date,
): { state: LockState; startedLock: boolean } {
  const windowExpired =
    state.windowStartedAt === null ||
    now.getTime() - state.windowStartedAt.getTime() >= FAILED_TRY_WINDOW_MS;
  // `lockedUntil` is still set here only if that lock has ended.
  const fresh = windowExpired || state.lockedUntil !== null;
  const failedCount = fresh ? 1 : state.failedCount + 1;
  const startedLock = failedCount >= LOCK_AFTER_FAILED_TRIES;
  return {
    startedLock,
    state: {
      failedCount,
      windowStartedAt: fresh ? now : state.windowStartedAt,
      lockedUntil: startedLock
        ? new Date(now.getTime() + LOCK_DURATION_MS)
        : null,
    },
  };
}
