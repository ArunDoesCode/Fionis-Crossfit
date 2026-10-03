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
