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

/** Friendly one-sentence text per code (BR-REC-128); filled in S3. */
export const ERROR_MESSAGES: Partial<Record<ErrorCode, string>> = {};

/** Friendly text for a server code; a generic fallback for unknown or missing codes. */
export const messageForCode = (_code: string | undefined): string => {
  throw new Error('not implemented');
};
