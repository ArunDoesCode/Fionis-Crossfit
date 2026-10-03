// STUB (Stream 0 / S1): signatures and docs only. S3 builds the bodies.
// Pure functions (BR-REC-12, 75). Durations are whole seconds everywhere; the
// frontend mirrors these names in `frontend/src/lib/domain/duration.ts`.
// Golden fixture: `tests/fixtures/duration-cases.json` (both packages).

/**
 * Parses what a person types: `"2:02"` is 122, `"1:05:30"` is 3930, `"0:45"`
 * is 45. Anything that is not `m:ss` or `h:mm:ss` (seconds 0-59) is `null`.
 */
export function parseDuration(_text: string): number | null {
  throw new Error("not implemented");
}

/** Shows seconds as `m:ss`; one hour or more as `h:mm:ss`: 122 is `"2:02"`, 3930 is `"1:05:30"`. */
export function formatDuration(_seconds: number): string {
  throw new Error("not implemented");
}

/**
 * Minutes and seconds typed in two boxes: minutes 0-599, seconds 0-59, whole
 * numbers; `null` when out of range (BR-REC-75). `(2, 2)` is 122.
 */
export function durationFromParts(
  _minutes: number,
  _seconds: number,
): number | null {
  throw new Error("not implemented");
}

/** The two boxes for a number of seconds: 122 is `{ minutes: 2, seconds: 2 }`; 3930 is `{ minutes: 65, seconds: 30 }`. */
export function durationToParts(_seconds: number): {
  minutes: number;
  seconds: number;
} {
  throw new Error("not implemented");
}
