/** Seconds from "2:02", "1:05:30" or "95"; null when the text is not a valid duration. */
export const parseDuration = (_text: string): number | null => {
  throw new Error('not implemented');
};

/** Seconds as "2:02" or, from one hour up, "1:05:30". */
export const formatDuration = (_seconds: number): string => {
  throw new Error('not implemented');
};

/** Minutes + seconds fields as total seconds; null when either is invalid (seconds above 59). */
export const durationFromParts = (_minutes: number, _seconds: number): number | null => {
  throw new Error('not implemented');
};

/** Total seconds split into whole minutes and 0-59 seconds. */
export const durationToParts = (_seconds: number): { minutes: number; seconds: number } => {
  throw new Error('not implemented');
};
