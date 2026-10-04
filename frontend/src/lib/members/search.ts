/** BR-REC-07: search starts at 2 characters once the outer spaces are trimmed (the API refuses less). */
export const isSearchReady = (q: string): boolean => q.trim().length >= 2;
