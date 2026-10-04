// Spec: docs/specs/member-records/assessments.md (v2) and ux.md BR-REC-128
//   BR-REC-86 — if Save fails (no connection, timeout, server error) the form stays filled with "Not saved —
//               check the connection and tap Save again"; saving twice never makes two assessments.
//   BR-REC-128 / api-contract BR-REC-154 — server codes always map to friendly text (the dictionary).
//   BR-REC-78 — "Enter at least one value" (NO_VALUES); BR-REC-83 — a future date (DATE_IN_FUTURE).
// Interface (names and shapes only): `@/lib/assessments/saveError` — `saveFailureText(error)` -> string | null:
//   the sentence next to the Save bar after a refused or failed Save, or null when the global handler owns it
//   (a 401 opens Login). A refusal the server explains goes through `messageForCode`; no answer at all, a
//   timeout or a server error is `ASSESSMENT_TEXT.notSaved`. `ApiError(status, message, code?)` from
//   `@/lib/api/errors`: the fetch wrapper throws it for every non-2xx answer; a lost connection or a timeout
//   makes `fetch` itself reject.
import { describe, expect, test } from 'bun:test';
import { ApiError } from '@/lib/api/errors';
import { saveFailureText } from '@/lib/assessments/saveError';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { messageForCode } from '@/lib/messages/errors';

const NOT_SAVED = 'Not saved — check the connection and tap Save again';

describe('BR-REC-86 no answer, a timeout or a server error: "Not saved — check the connection ..."', () => {
  test('BR-REC-86 the line is the fixed sentence of the dictionary', () => {
    expect(ASSESSMENT_TEXT.notSaved).toBe(NOT_SAVED);
  });

  test.each<[string, unknown]>([
    ['a lost connection (fetch rejects with a TypeError)', new TypeError('Failed to fetch')],
    ['a timeout', new DOMException('The operation timed out.', 'TimeoutError')],
    ['an aborted request', new DOMException('The operation was aborted.', 'AbortError')],
    ['a plain Error', new Error('socket hang up')],
    ['a string thrown', 'offline'],
    ['nothing at all', undefined],
    ['null', null],
  ])('BR-REC-86 %s -> not saved', (_name, error) => {
    expect(saveFailureText(error)).toBe(NOT_SAVED);
  });

  test.each([500, 502, 503, 504])('BR-REC-86 a server error (%d) -> not saved', (status) => {
    expect(saveFailureText(new ApiError(status, 'Server error'))).toBe(NOT_SAVED);
  });

  test('BR-REC-86 a 500 with INTERNAL_ERROR is still "not saved" (the form stays, try again)', () => {
    expect(saveFailureText(new ApiError(500, 'Internal', 'INTERNAL_ERROR'))).toBe(NOT_SAVED);
  });
});

describe('BR-REC-128 a refusal the server explains: the dictionary text for its code', () => {
  test.each<[number, string]>([
    [400, 'NO_VALUES'],
    [400, 'DATE_IN_FUTURE'],
    [400, 'METRIC_NOT_IN_TYPE'],
    [400, 'VALIDATION_ERROR'],
    [400, 'INVALID_JSON'],
    [404, 'NOT_FOUND'],
    [403, 'CSRF_ORIGIN'],
    [429, 'RATE_LIMITED'],
  ])('BR-REC-128 %d %s -> messageForCode', (status, code) => {
    expect(saveFailureText(new ApiError(status, 'server words', code))).toBe(messageForCode(code));
  });

  test('BR-REC-78 NO_VALUES reads as a plain sentence, not the "not saved" line', () => {
    const text = saveFailureText(new ApiError(400, 'No values', 'NO_VALUES'));
    expect(text).not.toBe(NOT_SAVED);
    expect((text ?? '').trim()).not.toBe('');
    expect(text).not.toContain('NO_VALUES');
  });

  test('BR-REC-83 DATE_IN_FUTURE reads as a plain sentence, not the "not saved" line', () => {
    const text = saveFailureText(new ApiError(400, 'In the future', 'DATE_IN_FUTURE'));
    expect(text).not.toBe(NOT_SAVED);
    expect(text).toBe(messageForCode('DATE_IN_FUTURE'));
  });

  test('BR-REC-128 the server message text is never shown, only the dictionary', () => {
    const text = saveFailureText(new ApiError(400, 'raw server words 12345', 'NO_VALUES'));
    expect(text).not.toContain('raw server words');
  });
});

describe("BR-REC-37 / auth: a lost login is the global handler's job", () => {
  test('a 401 gives no line here (the sign-in screen opens)', () => {
    expect(saveFailureText(new ApiError(401, 'Unauthorized', 'UNAUTHORIZED'))).toBeNull();
  });

  test('a 401 with another code gives no line here either', () => {
    expect(saveFailureText(new ApiError(401, 'Session expired', 'SESSION_EXPIRED'))).toBeNull();
  });
});
