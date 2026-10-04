// Spec: docs/specs/member-records/ux.md BR-REC-128 and docs/specs/member-records/api-contract.md BR-REC-154:
// every server error code maps to friendly text, one plain sentence saying what happened and what to do.
// Interface: docs/specs/member-records/api-contract.md "Error codes" (lib/messages/errors.ts).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CODES, ERROR_MESSAGES, type ErrorCode, messageForCode } from '@/lib/messages/errors';

// The code list of api-contract.md ("Error codes"), written out here on purpose so the test stays
// tied to the spec; api-contract.md adds the 501 placeholder NOT_IMPLEMENTED (D-019).
const SPEC_CODES = [
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
] as const;
const PLACEHOLDER_CODE = 'NOT_IMPLEMENTED';

const messageOf = (code: string): string =>
  (ERROR_MESSAGES as Record<string, string | undefined>)[code] ?? '';

// Like messageOf, but an empty or missing text fails the test, so a check on the text cannot pass on nothing.
const textOf = (code: string): string => {
  const text = messageOf(code);
  expect(text.trim()).not.toBe('');
  return text;
};

// Quotes and dashes the spec writes one way may be typed another way; compare on a plain form.
const plain = (text: string): string => text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

// Server codes found in the generated API manifest (the contract the backend publishes).
const manifestCodes = (): string[] => {
  const file = join(import.meta.dir, '../../../../backend/.contracts/api-manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    routes: { responses: Record<string, unknown> }[];
  };
  const found = new Set<string>();
  for (const route of manifest.routes) {
    for (const response of Object.values(route.responses)) {
      const code = (response as { code?: unknown } | null)?.code;
      const match = typeof code === 'string' ? /^enum:([A-Z_,]+)/.exec(code) : null;
      for (const name of match?.[1]?.split(',') ?? []) {
        found.add(name);
      }
    }
  }
  return [...found].sort();
};

describe('BR-REC-154 error code list', () => {
  test('BR-REC-154 ERROR_CODES holds every code in the api-contract list', () => {
    const missing = SPEC_CODES.filter((code) => !(ERROR_CODES as readonly string[]).includes(code));
    expect(missing).toEqual([]);
  });

  test('BR-REC-154 ERROR_CODES holds the 501 placeholder code', () => {
    expect(ERROR_CODES as readonly string[]).toContain(PLACEHOLDER_CODE);
  });

  test('BR-REC-154 ERROR_CODES holds no code the contract does not list', () => {
    const known: readonly string[] = [...SPEC_CODES, PLACEHOLDER_CODE];
    const extra = ERROR_CODES.filter((code) => !known.includes(code));
    expect(extra).toEqual([]);
  });

  test('BR-REC-154 ERROR_CODES has no duplicates', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  test('BR-REC-154 every code the published API manifest can return is in ERROR_CODES', () => {
    const codes = manifestCodes();
    expect(codes.length).toBeGreaterThan(0);
    const missing = codes.filter((code) => !(ERROR_CODES as readonly string[]).includes(code));
    expect(missing).toEqual([]);
  });

  test('BR-REC-154 every code the published API manifest can return has friendly text', () => {
    const withoutText = manifestCodes().filter((code) => messageOf(code).trim() === '');
    expect(withoutText).toEqual([]);
  });
});

describe('BR-REC-128 dictionary has every code', () => {
  test.each([...ERROR_CODES])('BR-REC-128 ERROR_MESSAGES has text for %s', (code) => {
    expect(typeof messageOf(code)).toBe('string');
    expect(messageOf(code).trim().length).toBeGreaterThan(0);
  });

  test('BR-REC-128 ERROR_MESSAGES holds no entry for a code that does not exist', () => {
    const stray = Object.keys(ERROR_MESSAGES).filter(
      (key) => !(ERROR_CODES as readonly string[]).includes(key),
    );
    expect(stray).toEqual([]);
  });

  test.each([...ERROR_CODES])(
    'BR-REC-128 messageForCode("%s") returns its dictionary text',
    (code) => {
      expect(messageForCode(code)).toBe(messageOf(code));
    },
  );
});

describe('BR-REC-128 every message is one plain sentence', () => {
  const codes = [...ERROR_CODES] as ErrorCode[];

  test.each(codes)('BR-REC-128 %s text starts with a capital and ends like a sentence', (code) => {
    const text = textOf(code);
    expect(text).toMatch(/^[A-Z]/);
    expect(text).toMatch(/[.!?]$/);
  });

  test.each(codes)('BR-REC-128 %s text is short: at most two sentences, one line', (code) => {
    const text = textOf(code);
    const sentences = text.split(/[.!?]+(?:\s+|$)/).filter((part) => part.trim() !== '');
    expect(sentences.length).toBeGreaterThanOrEqual(1);
    expect(sentences.length).toBeLessThanOrEqual(2);
    expect(text).not.toMatch(/[\r\n]/);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  test.each(codes)('BR-REC-128 %s text shows no code, id, status number or placeholder', (code) => {
    const text = textOf(code);
    for (const other of ERROR_CODES) {
      expect(text).not.toContain(other);
    }
    expect(text).not.toContain('_');
    expect(text).not.toMatch(/\b[45]\d\d\b/);
    expect(text).not.toMatch(/\b(undefined|null)\b|\[object|[{}]|%[sd]/i);
  });

  // BR-REC-126 word list: no technical words on screen. These are the words the spec names, plus a few
  // plainly technical ones.
  test.each(codes)('BR-REC-128 %s text uses no technical words (BR-REC-126)', (code) => {
    expect(textOf(code)).not.toMatch(
      /\b(metrics?|datatype|interval|snooze[ds]?|flag(ged)?|payload|deactivate[ds]?|json|csrf|idempotency|http|api)\b/i,
    );
  });
});

describe('BR-REC-128 texts the spec writes out', () => {
  test('BR-REC-128 PERIOD_OVERLAP says the membership overlaps another', () => {
    expect(plain(textOf('PERIOD_OVERLAP'))).toContain('This overlaps another membership');
  });

  test('BR-REC-128 PERIOD_OVERLAP tells the trainer to change the start date', () => {
    expect(plain(textOf('PERIOD_OVERLAP')).toLowerCase()).toContain('change the start date');
  });

  test('BR-REC-29 LOGIN_LOCKED says sign-in is paused after too many wrong tries', () => {
    expect(plain(textOf('LOGIN_LOCKED'))).toContain('Too many wrong tries, so sign-in is paused');
  });

  test('BR-REC-29 LOGIN_LOCKED does not say which part was wrong', () => {
    expect(textOf('LOGIN_LOCKED')).not.toMatch(/\b(username|user name|password)\b/i);
  });

  test('BR-REC-01 INVALID_CREDENTIALS does not say which part was wrong', () => {
    // Naming only the username or only the password would say which part was wrong.
    const text = textOf('INVALID_CREDENTIALS');
    const namesUser = /\b(username|user name|user)\b/i.test(text);
    const namesPassword = /\bpassword\b/i.test(text);
    expect(namesUser).toBe(namesPassword);
  });

  test('BR-REC-34 CURRENT_PASSWORD_WRONG says the current password is not right', () => {
    expect(plain(textOf('CURRENT_PASSWORD_WRONG'))).toContain('Current password is not right');
  });

  test('BR-REC-78 NO_VALUES asks for at least one value', () => {
    expect(plain(textOf('NO_VALUES'))).toContain('Enter at least one value');
  });

  test('BR-REC-61 NAME_TAKEN says the name is already used', () => {
    expect(plain(textOf('NAME_TAKEN'))).toContain('That name is already used');
  });

  test("BR-REC-50 START_BEFORE_JOIN says the membership can't start before the join date", () => {
    expect(plain(textOf('START_BEFORE_JOIN'))).toContain(
      "Membership can't start before the join date",
    );
  });
});

describe('BR-REC-128 messageForCode fallback', () => {
  const UNKNOWN_CODE = 'A_CODE_THE_APP_HAS_NEVER_HEARD_OF';
  const genericText = () => messageForCode(UNKNOWN_CODE);

  test('BR-REC-128 an unknown code gets a generic plain sentence', () => {
    const generic = genericText();
    expect(typeof generic).toBe('string');
    expect(generic.trim().length).toBeGreaterThan(0);
    expect(generic).toMatch(/^[A-Z]/);
    expect(generic).toMatch(/[.!?]$/);
    expect(generic).not.toContain(UNKNOWN_CODE);
    expect(generic).not.toContain('_');
  });

  test('BR-REC-128 a missing code gets the same generic sentence', () => {
    expect(messageForCode(undefined)).toBe(genericText());
  });

  test('BR-REC-128 an empty code gets the same generic sentence', () => {
    expect(messageForCode('')).toBe(genericText());
  });

  test.each(['constructor', 'toString', 'hasOwnProperty', '__proto__', 'valueOf'])(
    'BR-REC-128 object property name "%s" is an unknown code, not a message',
    (name) => {
      const text = messageForCode(name);
      expect(typeof text).toBe('string');
      expect(text).toBe(genericText());
    },
  );

  test('BR-REC-128 the generic sentence shows no technical words (BR-REC-126)', () => {
    expect(genericText()).not.toMatch(
      /\b(metrics?|datatype|interval|snooze[ds]?|flag(ged)?|payload|json|api|http)\b/i,
    );
  });
});
