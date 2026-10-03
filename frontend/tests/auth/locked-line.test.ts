// Spec: docs/specs/member-records/auth.md BR-REC-29 — while locked, Login says, without naming which part
// was wrong, "Too many wrong tries, so sign-in is paused. Try again in 9 minutes." (minutes rounded up);
// docs/specs/member-records/ux.md "Fixed lines" repeats the sentence word for word.
// Interface: `FIXED_LINES.signInLocked(minutes)` in `@/lib/messages/words` (existing export, ux word list).
// The rounding of `details.retryAfterSeconds` to minutes belongs to the Login page; see the open question
// in the test report (no named interface for it yet).
import { describe, expect, test } from 'bun:test';
import { FIXED_LINES } from '@/lib/messages/words';

describe('BR-REC-29 the locked sign-in line', () => {
  test('BR-REC-29 9 minutes left is the spec sentence word for word', () => {
    expect(FIXED_LINES.signInLocked(9)).toBe(
      'Too many wrong tries, so sign-in is paused. Try again in 9 minutes.',
    );
  });

  for (const minutes of [2, 5, 10, 15]) {
    test(`BR-REC-29 ${minutes} minutes left fills the number into the same sentence`, () => {
      expect(FIXED_LINES.signInLocked(minutes)).toBe(
        `Too many wrong tries, so sign-in is paused. Try again in ${minutes} minutes.`,
      );
    });
  }

  test('BR-REC-29 the line never names the username or the password', () => {
    for (const minutes of [1, 9, 15]) {
      expect(FIXED_LINES.signInLocked(minutes)).not.toMatch(
        /\b(username|user name|user|password)\b/i,
      );
    }
  });
});
