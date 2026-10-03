export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  /** Extra structured info returned as `details` in the error response. */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends AppError {
  constructor(
    message: string,
    code = "BAD_REQUEST",
    details?: Record<string, unknown>,
  ) {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", code = "UNAUTHORIZED") {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "Forbidden",
    code = "FORBIDDEN",
    details?: Record<string, unknown>,
  ) {
    super(message, 403, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found", code = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT") {
    super(message, 409, code);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests", code = "RATE_LIMITED") {
    super(message, 429, code);
  }
}

/**
 * 501 placeholder for endpoints whose stream has not built them yet (D-019).
 * Each stream replaces the placeholder handler of its own endpoints.
 */
export class NotImplementedError extends AppError {
  constructor(
    message = "This endpoint is not built yet",
    code = "NOT_IMPLEMENTED",
  ) {
    super(message, 501, code);
  }
}

/**
 * Every error `code` the member-records API can return, by HTTP status
 * (api-contract.md "Error codes" + the 501 placeholder). The route
 * descriptors build their error response schemas from this list and the
 * frontend error dictionary must have a message for each code (BR-REC-154).
 */
export const ERROR_CODES = {
  400: [
    "VALIDATION_ERROR",
    "INVALID_JSON",
    "DATE_IN_FUTURE",
    "START_BEFORE_JOIN",
    "NO_VALUES",
    "METRIC_NOT_IN_TYPE",
    "SNOOZE_TOO_FAR",
    "NO_DIRECTION",
    "CURRENT_PASSWORD_WRONG",
    "IDEMPOTENCY_KEY_MISSING",
  ],
  401: ["UNAUTHORIZED", "INVALID_CREDENTIALS", "SESSION_EXPIRED"],
  403: ["CSRF_ORIGIN"],
  404: ["NOT_FOUND"],
  409: [
    "NAME_TAKEN",
    "METRIC_LOCKED",
    "PERIOD_OVERLAP",
    "ASSESSMENT_DATE_TAKEN",
  ],
  413: ["PAYLOAD_TOO_LARGE"],
  422: ["IDEMPOTENCY_KEY_REUSED"],
  429: ["LOGIN_LOCKED", "RATE_LIMITED"],
  500: ["INTERNAL_ERROR"],
  501: ["NOT_IMPLEMENTED"],
} as const;

export type ErrorStatus = keyof typeof ERROR_CODES;
export type ErrorCode = (typeof ERROR_CODES)[ErrorStatus][number];
