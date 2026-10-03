// Spec: docs/specs/member-records/auth.md BR-REC-39 — opening any page without a sign-in goes to Login, then
// back to the page asked for; `next` must be a path inside the app, otherwise Home.
//   `/admin/members/42` -> Login -> `/admin/members/42`;  `next=https://evil.com` -> Home.
// Interface: .pipeline/member-records-auth/contract.md "Admin app interfaces" —
//   `safeNextPath(raw: string | null | undefined): string` in `@/lib/auth/safeNextPath`: returns `raw` when it
//   is a path inside the app (starts with one `/`, not `//` or `/\`, no scheme); otherwise `/admin`.
// Home for the admin app is `/admin` (contract: "Signed in on /login -> /admin").
import { beforeAll, describe, expect, test } from 'bun:test';

type SafeNextPath = typeof import('@/lib/auth/safeNextPath').safeNextPath;

let safeNextPath: SafeNextPath;

beforeAll(async () => {
  safeNextPath = (await import('@/lib/auth/safeNextPath')).safeNextPath;
});

const HOME = '/admin';

describe('BR-REC-39 a path inside the app is kept as it is', () => {
  const insidePaths = [
    '/admin',
    '/admin/members/42',
    '/admin/members',
    '/admin/members?tab=due',
    '/admin/members/42?tab=assessments&sort=date',
    '/admin/members/42#notes',
    '/admin/settings/account',
    '/admin/reports',
    '/admin/members?time=10:30',
  ];
  for (const path of insidePaths) {
    test(`BR-REC-39 ${path} is returned unchanged`, () => {
      expect(safeNextPath(path)).toBe(path);
    });
  }
});

describe('BR-REC-39 anything that is not a path inside the app goes Home', () => {
  const outside: Array<[string, string | null | undefined]> = [
    ['an https address (the spec example)', 'https://evil.com'],
    ['an http address with a path', 'http://evil.com/admin'],
    ['a scheme-relative address //host', '//evil.com'],
    ['a scheme-relative address //host/path', '//evil.com/admin/members'],
    ['a slash-backslash host (browsers read it as //host)', '/\\evil.com'],
    ['a slash-backslash host with a path', '/\\evil.com/admin'],
    ['a backslash host', '\\\\evil.com'],
    ['a single leading backslash', '\\evil.com'],
    ['a javascript: address', 'javascript:alert(1)'],
    ['a data: address', 'data:text/html,hello'],
    ['a mixed-case scheme', 'HtTpS://evil.com'],
    ['a relative path with no leading slash', 'admin/members'],
    ['a bare host name', 'evil.com'],
    ['an empty string', ''],
    ['null (no next in the address)', null],
    ['undefined (no next in the address)', undefined],
    ['text with a leading space before //', ' //evil.com'],
    ['a leading space before a scheme', ' https://evil.com'],
  ];
  for (const [label, raw] of outside) {
    test(`BR-REC-39 ${label} gives ${HOME}`, () => {
      expect(safeNextPath(raw)).toBe(HOME);
    });
  }
});

describe('BR-REC-39 browsers drop tabs and line breaks inside an address, so those cannot hide a host', () => {
  // A browser reads "/<TAB>/evil.com" as "//evil.com" (WHATWG URL parsing removes tab, LF and CR).
  const hidden: Array<[string, string]> = [
    ['a tab between the slashes', '/\t/evil.com'],
    ['a line feed between the slashes', '/\n/evil.com'],
    ['a carriage return between the slashes', '/\r/evil.com'],
    ['a tab between slash and backslash', '/\t\\evil.com'],
    ['a tab inside the scheme', 'ht\ttps://evil.com'],
  ];
  for (const [label, raw] of hidden) {
    test(`BR-REC-39 ${label} gives ${HOME}`, () => {
      expect(safeNextPath(raw)).toBe(HOME);
    });
  }
});

describe('BR-REC-39 the result is always safe to put in a redirect', () => {
  test('BR-REC-39 whatever comes in, the result starts with one slash and stays on the app address', () => {
    const inputs: Array<string | null | undefined> = [
      '/admin/members/42',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      'javascript:alert(1)',
      '',
      null,
      undefined,
    ];
    const base = 'https://gym.example.test';
    for (const raw of inputs) {
      const result = safeNextPath(raw);
      expect(result.startsWith('/')).toBe(true);
      expect(new URL(result, base).origin).toBe(base);
    }
  });
});
