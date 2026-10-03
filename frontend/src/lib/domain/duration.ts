// Pure duration helpers (BR-REC-12, 75). Stored in whole seconds; typed as minutes + seconds boxes
// (seconds 0-59, minutes 0-599); shown as "m:ss" and, from one hour up, "h:mm:ss".

const MAX_MINUTES = 599;
const MAX_SECONDS_TOTAL = MAX_MINUTES * 60 + 59; // 35999 = 9:59:59

const pad2 = (value: number): string => String(value).padStart(2, '0');

const DURATION_PATTERN = /^(?:(\d+):([0-5]\d)|(\d+):([0-5]\d):([0-5]\d))$/;

/**
 * Seconds from "m:ss" ("2:02") or "h:mm:ss" ("1:05:30"); null when the text is not a valid duration
 * (blank, a bare number such as "95", seconds or minutes above 59 in the h:mm:ss form, or more than
 * 599 minutes - the most the two boxes hold).
 */
export const parseDuration = (text: string): number | null => {
  const match = DURATION_PATTERN.exec(text);
  if (!match) return null;
  const total =
    match[1] !== undefined
      ? Number(match[1]) * 60 + Number(match[2])
      : Number(match[3]) * 3600 + Number(match[4]) * 60 + Number(match[5]);
  return total <= MAX_SECONDS_TOTAL ? total : null;
};

/** Seconds as "2:02" or, from one hour up, "1:05:30". */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(rest)}` : `${minutes}:${pad2(rest)}`;
};

/** Minutes (0-599) + seconds (0-59) fields as total seconds; null when either is not a whole number in range. */
export const durationFromParts = (minutes: number, seconds: number): number | null => {
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds)) return null;
  if (minutes < 0 || minutes > MAX_MINUTES || seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
};

/** Total seconds split into whole minutes and 0-59 seconds. */
export const durationToParts = (seconds: number): { minutes: number; seconds: number } => {
  const total = Math.max(0, Math.floor(seconds));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
};
