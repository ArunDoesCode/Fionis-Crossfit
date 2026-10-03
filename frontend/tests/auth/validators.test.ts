// Spec: docs/specs/member-records/auth.md
//   BR-REC-02 — the password is changed with the current password; minimum 8 characters
//               (new "abc" -> rejected, an error on `newPassword`).
//   BR-REC-27 — passwords are 8-128 characters of any kind (no other complexity rules);
//               129 characters -> "Use at most 128 characters".
//   BR-REC-01 — the login form takes username 1-64, password 1-128 (a short or wrong password is a normal
//               sign-in try, answered by the server, never a form error).
// Interface: .pipeline/member-records-auth/contract.md "Admin app interfaces" — `@/lib/validators/auth`:
//   `loginSchema` (username 1-64, password 1-128, remember boolean), `changePasswordSchema`
//   (currentPassword 1-128, newPassword 8-128), `PASSWORD_MIN_LENGTH = 8`, `PASSWORD_MAX_LENGTH = 128`.
//   Zod schemas: tested only through `safeParse` and the issues it reports.
import { beforeAll, describe, expect, test } from 'bun:test';

type Validators = typeof import('@/lib/validators/auth');

let validators: Validators;

beforeAll(async () => {
  validators = await import('@/lib/validators/auth');
});

interface Issue {
  path: PropertyKey[];
  message: string;
}

/** The issues a schema reports for `input` (empty when the input is accepted). */
function issuesOf(
  schema: Validators['loginSchema'] | Validators['changePasswordSchema'],
  input: unknown,
): Issue[] {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
}

const onField = (issues: Issue[], field: string) =>
  issues.filter((issue) => issue.path.length === 1 && issue.path[0] === field);

const chars = (n: number, char = 'a') => char.repeat(n);

const USE_AT_MOST_128 = 'Use at most 128 characters';

describe('BR-REC-27 the length limits are the spec numbers', () => {
  test('BR-REC-27 PASSWORD_MIN_LENGTH is 8', () => {
    expect(validators.PASSWORD_MIN_LENGTH).toBe(8);
  });

  test('BR-REC-27 PASSWORD_MAX_LENGTH is 128', () => {
    expect(validators.PASSWORD_MAX_LENGTH).toBe(128);
  });
});

describe('BR-REC-02 changePasswordSchema: a new password under 8 characters is rejected', () => {
  const tooShort: Array<[string, string]> = [
    ['"abc" (the spec example)', 'abc'],
    ['an empty password', ''],
    ['one character', 'a'],
    ['7 characters', chars(7)],
    ['7 spaces', ' '.repeat(7)],
  ];
  for (const [label, newPassword] of tooShort) {
    test(`BR-REC-02 ${label} gives an issue on newPassword`, () => {
      const issues = issuesOf(validators.changePasswordSchema, {
        currentPassword: 'old-password-1',
        newPassword,
      });
      expect(onField(issues, 'newPassword').length).toBeGreaterThan(0);
    });
  }

  test('BR-REC-02 the only field in error is newPassword (the current password is fine)', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: 'old-password-1',
      newPassword: 'abc',
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.path[0] === 'newPassword')).toBe(true);
  });

  test('BR-REC-02 the error on newPassword carries a message to show', () => {
    const issues = onField(
      issuesOf(validators.changePasswordSchema, {
        currentPassword: 'old-password-1',
        newPassword: 'abc',
      }),
      'newPassword',
    );
    expect(issues[0]?.message.trim().length).toBeGreaterThan(0);
  });

  test('BR-REC-02 a missing newPassword gives an issue on newPassword', () => {
    const issues = issuesOf(validators.changePasswordSchema, { currentPassword: 'old-password-1' });
    expect(onField(issues, 'newPassword').length).toBeGreaterThan(0);
  });

  test('BR-REC-02 a number is not a password', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: 'old-password-1',
      newPassword: 12345678,
    });
    expect(onField(issues, 'newPassword').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-27 changePasswordSchema: 8 to 128 characters of any kind are accepted', () => {
  const accepted: Array<[string, string]> = [
    ['exactly 8 characters', chars(8)],
    ['exactly 128 characters', chars(128)],
    ['digits only', '12345678'],
    ['one repeated letter', 'aaaaaaaa'],
    ['symbols only', '!@#$%^&*'],
    ['8 spaces (any kind of character)', ' '.repeat(8)],
    ['letters with accents', 'pässwörd'],
    ['a pass phrase with spaces', 'correct horse battery staple'],
    ['128 characters of mixed kinds', `${chars(64, 'Z')}${chars(32, '9')}${chars(32, '#')}`],
  ];
  for (const [label, newPassword] of accepted) {
    test(`BR-REC-27 ${label} is accepted`, () => {
      expect(
        issuesOf(validators.changePasswordSchema, {
          currentPassword: 'old-password-1',
          newPassword,
        }),
      ).toEqual([]);
    });
  }

  test('BR-REC-27 the password is not trimmed: 6 letters between spaces still make 8 characters', () => {
    const input = { currentPassword: 'old-password-1', newPassword: ' abcdef ' };
    const result = validators.changePasswordSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.newPassword).toBe(' abcdef ');
  });

  test('BR-REC-27 the parsed data is exactly what was typed (no change to either password)', () => {
    const input = { currentPassword: '  Old Pass 1  ', newPassword: '\tNew Pass 2\t' };
    const result = validators.changePasswordSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(input);
  });
});

describe('BR-REC-27 changePasswordSchema: 129 characters is too long', () => {
  test('BR-REC-27 129 characters gives an issue on newPassword', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: 'old-password-1',
      newPassword: chars(129),
    });
    expect(onField(issues, 'newPassword').length).toBeGreaterThan(0);
  });

  test('BR-REC-27 the message on newPassword for 129 characters is "Use at most 128 characters"', () => {
    const issues = onField(
      issuesOf(validators.changePasswordSchema, {
        currentPassword: 'old-password-1',
        newPassword: chars(129),
      }),
      'newPassword',
    );
    expect(issues.map((issue) => issue.message)).toContain(USE_AT_MOST_128);
  });

  test('BR-REC-27 a much longer password gets the same message', () => {
    const issues = onField(
      issuesOf(validators.changePasswordSchema, {
        currentPassword: 'old-password-1',
        newPassword: chars(1000),
      }),
      'newPassword',
    );
    expect(issues.map((issue) => issue.message)).toContain(USE_AT_MOST_128);
  });

  test('BR-REC-27 the "at most 128" message is not shown for a password that fits', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: 'old-password-1',
      newPassword: chars(128),
    });
    expect(issues.map((issue) => issue.message)).not.toContain(USE_AT_MOST_128);
  });

  test('BR-REC-27 the "at most 128" message is not shown for a password that is too short', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: 'old-password-1',
      newPassword: 'abc',
    });
    expect(issues.map((issue) => issue.message)).not.toContain(USE_AT_MOST_128);
  });
});

describe('BR-REC-34 / contract: changePasswordSchema checks the current password only for 1-128 characters', () => {
  // A wrong current password is answered by the server (400 CURRENT_PASSWORD_WRONG), so the form must let
  // any 1-128 character value through, however short.
  for (const [label, currentPassword] of [
    ['1 character', 'a'],
    ['a 3-character old password', 'abc'],
    ['128 characters', chars(128)],
  ] as const) {
    test(`BR-REC-34 a current password of ${label} is accepted`, () => {
      const issues = issuesOf(validators.changePasswordSchema, {
        currentPassword,
        newPassword: 'new-password-1',
      });
      expect(issues).toEqual([]);
    });
  }

  test('BR-REC-34 an empty current password gives an issue on currentPassword', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: '',
      newPassword: 'new-password-1',
    });
    expect(onField(issues, 'currentPassword').length).toBeGreaterThan(0);
    expect(onField(issues, 'newPassword')).toEqual([]);
  });

  test('BR-REC-34 129 characters as current password gives an issue on currentPassword', () => {
    const issues = issuesOf(validators.changePasswordSchema, {
      currentPassword: chars(129),
      newPassword: 'new-password-1',
    });
    expect(onField(issues, 'currentPassword').length).toBeGreaterThan(0);
    expect(onField(issues, 'newPassword')).toEqual([]);
  });

  test('BR-REC-34 a missing current password gives an issue on currentPassword', () => {
    const issues = issuesOf(validators.changePasswordSchema, { newPassword: 'new-password-1' });
    expect(onField(issues, 'currentPassword').length).toBeGreaterThan(0);
  });
});

describe('BR-REC-01 loginSchema: username 1-64, password 1-128, remember a boolean', () => {
  const valid = { username: 'admin', password: 'right-pass-1', remember: true };

  test('BR-REC-01 a normal sign-in form is accepted and comes back unchanged', () => {
    const result = validators.loginSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(valid);
  });

  test('BR-REC-01 remember false is accepted and kept false', () => {
    const result = validators.loginSchema.safeParse({ ...valid, remember: false });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.remember).toBe(false);
  });

  test('BR-REC-01 an empty username gives an issue on username', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { ...valid, username: '' }), 'username').length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 a 64-character username is accepted', () => {
    expect(issuesOf(validators.loginSchema, { ...valid, username: chars(64) })).toEqual([]);
  });

  test('BR-REC-01 a 65-character username gives an issue on username', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { ...valid, username: chars(65) }), 'username')
        .length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 an empty password gives an issue on password', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { ...valid, password: '' }), 'password').length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 a 1-character password is a normal try, not a form error (the server decides)', () => {
    expect(issuesOf(validators.loginSchema, { ...valid, password: 'a' })).toEqual([]);
  });

  test('BR-REC-01 a 7-character password is a normal try, not a form error (the 8 minimum is for new passwords)', () => {
    expect(issuesOf(validators.loginSchema, { ...valid, password: chars(7) })).toEqual([]);
  });

  test('BR-REC-01 a 128-character password is accepted', () => {
    expect(issuesOf(validators.loginSchema, { ...valid, password: chars(128) })).toEqual([]);
  });

  test('BR-REC-01 a 129-character password gives an issue on password', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { ...valid, password: chars(129) }), 'password')
        .length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 a password is not trimmed', () => {
    const result = validators.loginSchema.safeParse({ ...valid, password: '  spaced pass  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.password).toBe('  spaced pass  ');
  });

  test('BR-REC-01 remember must be a real boolean, not the text "true"', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { ...valid, remember: 'true' }), 'remember').length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 a missing username gives an issue on username', () => {
    expect(
      onField(
        issuesOf(validators.loginSchema, { password: 'right-pass-1', remember: true }),
        'username',
      ).length,
    ).toBeGreaterThan(0);
  });

  test('BR-REC-01 a missing password gives an issue on password', () => {
    expect(
      onField(issuesOf(validators.loginSchema, { username: 'admin', remember: true }), 'password')
        .length,
    ).toBeGreaterThan(0);
  });
});
