// The device-side draft (BR-REC-85, D13): what was typed and not saved yet, kept per member + assessment +
// date in `localStorage`. Values only (typed text of Number fields, seconds of Time fields), never tokens.
// Storage can be blocked (private mode) or full: nothing here throws, a missing draft is just "no draft".

export const DRAFT_PREFIX = 'assess-draft:v1:';
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface Draft {
  /** When it was kept (ms since 1970). */
  savedAt: number;
  isEstimated: boolean;
  values: Record<string, string | number | null>;
}

export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export const draftKey = (memberId: string, typeId: string, date: string): string =>
  `${DRAFT_PREFIX}${memberId}:${typeId}:${date}`;

const isEmptyValue = (value: string | number | null): boolean =>
  value === null || (typeof value === 'string' && value.trim() === '');

/** Nothing typed in any box. */
export const draftIsEmpty = (values: Draft['values']): boolean =>
  Object.values(values).every(isEmptyValue);

function isDraft(value: unknown): value is Draft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { savedAt, isEstimated, values } = value as Record<string, unknown>;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return false;
  if (typeof isEstimated !== 'boolean') return false;
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return false;
  return Object.values(values).every(
    (entry) => entry === null || typeof entry === 'string' || typeof entry === 'number',
  );
}

function parseDraft(raw: string | null): Draft | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

const isExpired = (draft: Draft, now: number): boolean => now - draft.savedAt > DRAFT_MAX_AGE_MS;

/** Removes a key, ignoring a storage that refuses. */
export function clearDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // Blocked storage: nothing to remove.
  }
}

/** Keeps the draft; when every box is empty it removes the key instead. False = nothing is kept. */
export function saveDraft(storage: DraftStorage, key: string, draft: Draft): boolean {
  if (draftIsEmpty(draft.values)) {
    clearDraft(storage, key);
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

/** The kept draft, or null. A broken or older-than-7-days item is removed (exactly 7 days is kept). */
export function loadDraft(storage: DraftStorage, key: string, now: number): Draft | null {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const draft = parseDraft(raw);
  if (draft === null || isExpired(draft, now)) {
    clearDraft(storage, key);
    return null;
  }
  return draft;
}

/** Whenever a form opens: removes expired or broken drafts under the prefix (other keys are never touched). */
export function dropExpiredDrafts(storage: DraftStorage, now: number): number {
  let keys: string[];
  try {
    keys = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }
  let dropped = 0;
  for (const key of keys) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    const draft = parseDraft(raw);
    if (draft !== null && !isExpired(draft, now)) continue;
    clearDraft(storage, key);
    dropped += 1;
  }
  return dropped;
}

/** The browser's own storage, or null where it is missing or blocked (private mode): then there are no drafts. */
export function browserDraftStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** "10:42" for a draft kept today, "2 Oct, 10:42" for an older one (the device's clock and zone). */
export function draftTimeLabel(savedAt: number, now: number): string {
  const saved = new Date(savedAt);
  const clock = `${String(saved.getHours()).padStart(2, '0')}:${String(saved.getMinutes()).padStart(2, '0')}`;
  if (saved.toDateString() === new Date(now).toDateString()) return clock;
  const month = saved.toLocaleString('en', { month: 'short' });
  return `${saved.getDate()} ${month}, ${clock}`;
}
