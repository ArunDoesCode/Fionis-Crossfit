/** Every server error code (api-contract.md "Error codes") plus the 501 placeholder (D-019). */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_JSON',
  'DATE_IN_FUTURE',
  'START_BEFORE_JOIN',
  'NO_VALUES',
  'METRIC_NOT_IN_TYPE',
  'SNOOZE_TOO_FAR',
  'NO_DIRECTION',
  'CURRENT_PASSWORD_WRONG',
  'IDEMPOTENCY_KEY_MISSING',
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'CSRF_ORIGIN',
  'NOT_FOUND',
  'NAME_TAKEN',
  'METRIC_LOCKED',
  'PERIOD_OVERLAP',
  'ASSESSMENT_DATE_TAKEN',
  'PAYLOAD_TOO_LARGE',
  'IDEMPOTENCY_KEY_REUSED',
  'LOGIN_LOCKED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'NOT_IMPLEMENTED',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Friendly text per code (BR-REC-128): what happened and what to do, in the word list of BR-REC-126.
 * Complete by type, so adding a code to `ERROR_CODES` fails the build until it has a sentence.
 * Where a screen knows more (minutes left on a lock, the assessment and date in a clash), it adds that itself.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: "Some details aren't right. Check the fields and try again.",
  INVALID_JSON: 'Something went wrong sending that. Please try again.',
  DATE_IN_FUTURE: 'That date is in the future. Pick today or an earlier day.',
  START_BEFORE_JOIN: "Membership can't start before the join date. Pick a later start date.",
  NO_VALUES: 'Enter at least one value.',
  METRIC_NOT_IN_TYPE:
    "One of those measurements isn't part of this assessment. Reload the page and try again.",
  SNOOZE_TOO_FAR: 'Pick a reminder date within 90 days from today.',
  NO_DIRECTION: "This measurement has no direction, so it can't be ranked. Pick a different one.",
  CURRENT_PASSWORD_WRONG: 'Current password is not right. Try again.',
  IDEMPOTENCY_KEY_MISSING: 'Something went wrong saving that. Please try again.',
  UNAUTHORIZED: 'Please sign in to continue.',
  INVALID_CREDENTIALS: "That sign-in didn't work. Check what you typed and try again.",
  SESSION_EXPIRED: 'Your sign-in has ended. Please sign in again.',
  CSRF_ORIGIN: "This page isn't allowed to make that change. Reload the app and try again.",
  NOT_FOUND: "We couldn't find that. It may have been removed.",
  NAME_TAKEN: 'That name is already used. Pick a different name.',
  METRIC_LOCKED:
    "This measurement already has results, so its unit and number or time setting can't change. Add a new measurement instead.",
  PERIOD_OVERLAP: 'This overlaps another membership. Change the start date.',
  ASSESSMENT_DATE_TAKEN: "There's already an assessment on that date. Open it instead.",
  PAYLOAD_TOO_LARGE: 'That is too much to send at once. Remove some of it and try again.',
  IDEMPOTENCY_KEY_REUSED:
    'This was already saved with different details. Reload the page and check before trying again.',
  LOGIN_LOCKED: 'Too many wrong tries, so sign-in is paused. Try again later.',
  RATE_LIMITED: 'Too many tries in a short time. Wait a minute and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  NOT_IMPLEMENTED: "This isn't ready yet. Please try again later.",
};

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

// `hasOwn`, not `in` or a plain lookup: a code like "constructor" must not find an inherited property.
const isErrorCode = (code: string): code is ErrorCode => Object.hasOwn(ERROR_MESSAGES, code);

/** Friendly text for a server code; a generic plain sentence for unknown or missing codes. */
export const messageForCode = (code: string | undefined): string =>
  code !== undefined && isErrorCode(code) ? ERROR_MESSAGES[code] : GENERIC_MESSAGE;
