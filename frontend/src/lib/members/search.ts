/** BR-REC-07: search starts at 2 characters once the outer spaces are trimmed (the API refuses less). */
export const isSearchReady = (q: string): boolean => q.trim().length >= 2;

/** E16 `q` is 2–100 characters (api-contract changelog 2026-10-04): more than this answers 400. */
const SEARCH_MAX_LENGTH = 100;

/**
 * The first 100 characters of `q`; shorter text is unchanged. Callers trim first, then clamp (the server
 * trims before it counts). Used wherever the E16 `q` is built, also for `?q=` read from the URL, so a long
 * paste or a hand-typed address searches the first 100 characters instead of failing with a 400.
 */
export const clampSearchText = (q: string): string => q.slice(0, SEARCH_MAX_LENGTH);
