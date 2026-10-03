// Spec: docs/specs/member-records/auth.md
//   BR-REC-01 — the error never says which part was wrong (wrong user and wrong password read the same).
//   BR-REC-29 — while locked, Login says, without naming which part was wrong, "Too many wrong tries, so
//               sign-in is paused. Try again in 9 minutes." (minutes rounded up);
//               API: 429 with `details.retryAfterSeconds`.
// Interface: .pipeline/member-records-auth/contract.md "Admin app interfaces" —
//   `loginErrorMessage(err: unknown): string` in `@/lib/auth/loginError`:
//     401 -> "That username or password is not right.";
//     429 `LOGIN_LOCKED` -> the BR-REC-29 line with minutes = ceil(`details.retryAfterSeconds` / 60);
//     anything else -> the error dictionary's text for its code (`messageForCode`, `@/lib/messages/errors`).
//   `ApiError.body` is the whole server envelope `{ success, message, code, details? }` (the fetch wrapper's
//   existing behaviour, checked in fetch-wrapper.test.ts).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { API_ROUTES } from '@/lib/api/routes';
import { messageForCode } from '@/lib/messages/errors';
import { errorResponse, installFetch, setAuthEnv } from './helpers';

type LoginErrorMessage = typeof import('@/lib/auth/loginError').loginErrorMessage;
type Api = typeof import('@/lib/api/client').api;

let loginErrorMessage: LoginErrorMessage;
let api: Api;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  api = (await import('@/lib/api/client')).api;
  loginErrorMessage = (await import('@/lib/auth/loginError')).loginErrorMessage;
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
});

afterAll(() => {
  restoreEnv();
});

const WRONG_SIGN_IN = 'That username or password is not right.';

const lockedLine = (minutes: number) =>
  `Too many wrong tries, so sign-in is paused. Try again in ${minutes} minutes.`;

/** An ApiError the way the fetch wrapper builds it: status, message, code, and the whole envelope as body. */
function apiError(status: number, code: string | undefined, message: string, details?: unknown) {
  return new ApiError(status, message, code, {
    success: false,
    message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
  });
}

const lockedError = (retryAfterSeconds: number) =>
  apiError(429, 'LOGIN_LOCKED', 'Locked', { retryAfterSeconds });

describe('BR-REC-01 a 401 is the one "not right" sentence, whichever part was wrong', () => {
  test('BR-REC-01 401 INVALID_CREDENTIALS reads "That username or password is not right."', () => {
    expect(loginErrorMessage(apiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials'))).toBe(
      WRONG_SIGN_IN,
    );
  });

  test('BR-REC-01 the sentence does not change with the server message (it never says which part was wrong)', () => {
    const messages = [
      'Invalid credentials',
      'Unknown username',
      'Wrong password for admin',
      'The password is incorrect',
      '',
    ];
    for (const message of messages) {
      expect(loginErrorMessage(apiError(401, 'INVALID_CREDENTIALS', message))).toBe(WRONG_SIGN_IN);
    }
  });

  test('BR-REC-01 the sentence names both parts together, never one of them alone', () => {
    expect(loginErrorMessage(apiError(401, 'INVALID_CREDENTIALS', 'Wrong'))).toMatch(
      /username or password/,
    );
  });
});

describe('BR-REC-29 a locked login says how many minutes are left, rounded up', () => {
  // [seconds left from the server, minutes shown]
  const rounding: Array<[number, number]> = [
    [61, 2],
    [120, 2],
    [121, 3],
    [539, 9],
    [540, 9], // spec example: locked 10:00, try 10:06 -> 9 minutes
    [541, 10],
    [599, 10],
    [600, 10],
    [601, 11],
    [840, 14],
    [841, 15],
    [899, 15],
    [900, 15],
  ];
  for (const [seconds, minutes] of rounding) {
    test(`BR-REC-29 ${seconds} s left reads "Try again in ${minutes} minutes."`, () => {
      expect(loginErrorMessage(lockedError(seconds))).toBe(lockedLine(minutes));
    });
  }

  for (const seconds of [1, 30, 59, 60]) {
    test(`BR-REC-29 ${seconds} s left reads "Try again in 1 minute" (rounded up, never 0)`, () => {
      expect(loginErrorMessage(lockedError(seconds))).toMatch(
        /^Too many wrong tries, so sign-in is paused\. Try again in 1 minutes?\.$/,
      );
    });
  }

  test('BR-REC-29 the spec sentence word for word: 9 minutes', () => {
    expect(loginErrorMessage(lockedError(540))).toBe(
      'Too many wrong tries, so sign-in is paused. Try again in 9 minutes.',
    );
  });

  test('BR-REC-29 the line is the typed one, not the server message', () => {
    const error = apiError(429, 'LOGIN_LOCKED', 'Login is locked for 540 seconds', {
      retryAfterSeconds: 540,
    });
    expect(loginErrorMessage(error)).toBe(lockedLine(9));
  });

  test('BR-REC-29 the line never names which part was wrong', () => {
    for (const seconds of [30, 540, 900]) {
      expect(loginErrorMessage(lockedError(seconds))).not.toMatch(
        /\b(username|user name|user|password)\b/i,
      );
    }
  });

  test('BR-REC-29 a lock is not shown as the wrong-sign-in sentence', () => {
    expect(loginErrorMessage(lockedError(540))).not.toBe(WRONG_SIGN_IN);
  });
});

describe('BR-REC-01 / 29 through the real fetch wrapper (E01 answers)', () => {
  test('BR-REC-01 E01 401 INVALID_CREDENTIALS from the server becomes the "not right" sentence', async () => {
    fetchSpy = installFetch(() => errorResponse(401, 'INVALID_CREDENTIALS', 'Invalid credentials'));
    const error = await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'wrong-pass', remember: true })
      .catch((err: unknown) => err);
    expect(loginErrorMessage(error)).toBe(WRONG_SIGN_IN);
  });

  test('BR-REC-29 E01 429 LOGIN_LOCKED with retryAfterSeconds 540 becomes the 9-minute line', async () => {
    fetchSpy = installFetch(() =>
      errorResponse(429, 'LOGIN_LOCKED', 'Locked', { retryAfterSeconds: 540 }),
    );
    const error = await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'right-pass-1', remember: true })
      .catch((err: unknown) => err);
    expect(loginErrorMessage(error)).toBe(lockedLine(9));
  });

  test('BR-REC-29 E01 429 LOGIN_LOCKED with retryAfterSeconds 1 never shows 0 minutes', async () => {
    fetchSpy = installFetch(() =>
      errorResponse(429, 'LOGIN_LOCKED', 'Locked', { retryAfterSeconds: 1 }),
    );
    const error = await api
      .post(API_ROUTES.AUTH.LOGIN, { username: 'admin', password: 'right-pass-1', remember: true })
      .catch((err: unknown) => err);
    expect(loginErrorMessage(error)).toMatch(/Try again in 1 minutes?\./);
  });
});

describe('BR-REC-128 / contract: any other answer reads as the error dictionary text for its code', () => {
  const others: Array<[string, number, string]> = [
    ['429 RATE_LIMITED', 429, 'RATE_LIMITED'],
    ['403 CSRF_ORIGIN', 403, 'CSRF_ORIGIN'],
    ['500 INTERNAL_ERROR', 500, 'INTERNAL_ERROR'],
    ['400 VALIDATION_ERROR', 400, 'VALIDATION_ERROR'],
    ['400 INVALID_JSON', 400, 'INVALID_JSON'],
    ['501 NOT_IMPLEMENTED', 501, 'NOT_IMPLEMENTED'],
    ['an unknown code from a newer server', 500, 'SOMETHING_NEW'],
  ];
  for (const [label, status, code] of others) {
    test(`BR-REC-128 ${label} gives messageForCode("${code}")`, () => {
      expect(loginErrorMessage(apiError(status, code, 'Server text'))).toBe(messageForCode(code));
    });
  }

  test('BR-REC-01 a rate limit is not mistaken for a wrong password or a lock', () => {
    const text = loginErrorMessage(apiError(429, 'RATE_LIMITED', 'Slow down'));
    expect(text).not.toBe(WRONG_SIGN_IN);
    expect(text).not.toMatch(/Try again in \d+ minutes?\./);
  });

  test('BR-REC-128 an error with no code gives the dictionary text for "no code"', () => {
    expect(loginErrorMessage(new ApiError(500, 'Boom'))).toBe(messageForCode(undefined));
  });

  test('BR-REC-01 a 403 or 500 never says the username or password was wrong', () => {
    expect(loginErrorMessage(apiError(403, 'CSRF_ORIGIN', 'No'))).not.toBe(WRONG_SIGN_IN);
    expect(loginErrorMessage(apiError(500, 'INTERNAL_ERROR', 'Boom'))).not.toBe(WRONG_SIGN_IN);
  });
});

describe('BR-REC-128 things that are not an ApiError still give a plain sentence', () => {
  const notApiErrors: Array<[string, unknown]> = [
    ['a network failure', new TypeError('fetch failed')],
    ['a plain Error', new Error('boom')],
    ['a string', 'boom'],
    ['null', null],
    ['undefined', undefined],
  ];
  for (const [label, error] of notApiErrors) {
    test(`BR-REC-128 ${label} gives a non-empty sentence that does not blame the password or claim a lock`, () => {
      const text = loginErrorMessage(error);
      expect(typeof text).toBe('string');
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toBe(WRONG_SIGN_IN);
      expect(text).not.toMatch(/Try again in \d+ minutes?\./);
    });
  }
});
