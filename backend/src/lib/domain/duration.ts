// Pure functions (BR-REC-12, 75). Durations are whole seconds everywhere; the
// frontend mirrors these names in `frontend/src/lib/domain/duration.ts`.
// Golden fixture: `tests/fixtures/duration-cases.json` (both packages).

const MAX_MINUTES = 599;
/** 599:59, the most the two boxes hold (shown as 9:59:59). */
const MAX_SECONDS_TOTAL = MAX_MINUTES * 60 + 59;

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** `m:ss` or `h:mm:ss`; seconds (and minutes in the long form) are exactly two digits, 00-59. */
const DURATION_PATTERN = /^(?:(\d+):([0-5]\d)|(\d+):([0-5]\d):([0-5]\d))$/;

/**
 * Parses what a person types: `"2:02"` is 122, `"1:05:30"` is 3930, `"0:45"`
 * is 45. Anything that is not `m:ss` or `h:mm:ss` is `null`: a bare number
 * (`"95"`), seconds that are not two digits 00-59 (`"1:5"`, `"2:60"`), or
 * more than 599:59 (`"10:00:00"`), so a pasted value always fits the two boxes.
 */
export function parseDuration(text: string): number | null {
  const match = DURATION_PATTERN.exec(text);
  if (!match) return null;
  const total =
    match[1] !== undefined
      ? Number(match[1]) * 60 + Number(match[2])
      : Number(match[3]) * 3600 + Number(match[4]) * 60 + Number(match[5]);
  return total <= MAX_SECONDS_TOTAL ? total : null;
}

/** Shows seconds as `m:ss`; one hour or more as `h:mm:ss`: 122 is `"2:02"`, 3930 is `"1:05:30"`. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0
    ? `${hours}:${pad2(minutes)}:${pad2(rest)}`
    : `${minutes}:${pad2(rest)}`;
}

/**
 * Minutes and seconds typed in two boxes: minutes 0-599, seconds 0-59, whole
 * numbers; `null` when out of range (BR-REC-75). `(2, 2)` is 122.
 */
export function durationFromParts(
  minutes: number,
  seconds: number,
): number | null {
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  if (minutes < 0 || minutes > MAX_MINUTES || seconds < 0 || seconds > 59) {
    return null;
  }
  return minutes * 60 + seconds;
}

/** The two boxes for a number of seconds: 122 is `{ minutes: 2, seconds: 2 }`; 3930 is `{ minutes: 65, seconds: 30 }`. */
export function durationToParts(seconds: number): {
  minutes: number;
  seconds: number;
} {
  const total = Math.max(0, Math.floor(seconds));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}
