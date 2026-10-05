// Spec: docs/specs/member-records/members.md BR-REC-201, 203, 204 ("Build clarifications (U5)"), ux.md BR-REC-183.
// Source-level checks (no DOM runner here): what must exist, and what must be gone. Behaviour that needs a
// browser (no network while typing, <= 50 ms per key, CLS) is manual-only.

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonResponse, setAuthEnv } from '../auth/helpers';
import { appLikeClient, callHook, flush, recordingFetch } from '../due/hookHarness';

const SRC = join(import.meta.dir, '..', '..', 'src');
const read = (rel: string): string =>
  existsSync(join(SRC, rel)) ? readFileSync(join(SRC, rel), 'utf8') : '';
const dirText = (rel: string): string =>
  existsSync(join(SRC, rel))
    ? readdirSync(join(SRC, rel))
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => readFileSync(join(SRC, rel, f), 'utf8'))
        .join('\n')
    : '';
/** Text of the function whose declaration contains `name`, up to the next top-level declaration. */
const fnBody = (text: string, name: string): string => {
  const at = text.search(new RegExp(`function ${name}\\b|const ${name}\\b`));
  if (at < 0) return '';
  const rest = text.slice(at + 10);
  const next = rest.search(/\n(export |function |const |\/\*\*)/);
  return next < 0 ? rest : rest.slice(0, next);
};

const members = read('lib/api/members/queries.ts');

describe('BR-REC-203 directory query', () => {
  test('memberKeys.directory() exists and sits under the member key root', () => {
    expect(members).toMatch(/directory:\s*\(\)\s*=>/);
    expect(members).toMatch(/directory:\s*\(\)\s*=>\s*\[\s*\.\.\.memberKeys\.all\(\)/);
  });
  test('memberDirectoryQuery is exported', () =>
    expect(members).toMatch(/export (const|function) memberDirectoryQuery/));
  test('it loops pages of 100 with status=any', () => {
    const body = fnBody(members, 'memberDirectoryQuery');
    expect(body).toMatch(/status:\s*['"]any['"]/);
    expect(`${members}`).toMatch(/pageSize:\s*100|DIRECTORY_PAGE_SIZE\s*=\s*100/);
    expect(body).toMatch(/while|for\s*\(|do\s*\{|page\s*[+]=|page\s*\+\s*1|page\s*\+\+/);
  });
  test('it is kept fresh for 60 s', () =>
    expect(members).toMatch(/60[_ ]?(000|\s*\*\s*1000)|1000\s*\*\s*60/));
  test('assessment save invalidates a key covering the directory, and never the bare member root (BR-REC-209, 203)', async () => {
    const calls: unknown[][] = [];
    const mod = (await import('@/lib/api/assessments/queries')) as unknown as {
      invalidateAssessmentData(qc: {
        invalidateQueries(o: { queryKey: readonly unknown[] }): Promise<void>;
      }): Promise<unknown>;
    };
    await mod.invalidateAssessmentData({
      invalidateQueries: async (o) => {
        calls.push([...o.queryKey]);
      },
    });
    const m = (await import('@/lib/api/members/queries')) as unknown as {
      memberKeys: { directory(): readonly unknown[] };
    };
    const dirKey = m.memberKeys.directory();
    const covered = calls.some((k) =>
      k.every((part, i) => JSON.stringify(part) === JSON.stringify(dirKey[i])),
    );
    expect(covered).toBe(true);
    expect(calls.some((k) => k.length === 1 && k[0] === 'members')).toBe(false);
  });
  test.each(['useArchiveMember', 'useRestoreMember'])(
    'BR-REC-203 %s success marks the directory data out of date',
    async (hookName) => {
      const restoreEnv = setAuthEnv();
      const spy = recordingFetch(() =>
        jsonResponse(200, { success: true, data: { id: 'mm1', fullName: 'Surya Pratap' } }),
      );
      try {
        const m = (await import('@/lib/api/members/queries')) as unknown as {
          memberKeys: { directory(): readonly unknown[] };
        } & Record<string, unknown>;
        const client = appLikeClient();
        client.setQueryData(m.memberKeys.directory(), [{ id: 'mm1' }]);
        const useIt = m[hookName] as (id: string) => { mutateAsync(): Promise<unknown> };
        const mutation = callHook(client, () => useIt('mm1'));
        await mutation.mutateAsync();
        await flush();
        expect(client.getQueryState(m.memberKeys.directory())?.isInvalidated).toBe(true);
      } finally {
        spy.restore();
        restoreEnv();
      }
    },
  );
  test('membership period writes refresh the directory key', () => {
    const body = fnBody(members, 'useInvalidateMembers');
    expect(body).toMatch(/memberKeys\.directory\(\)|memberKeys\.all\(\)/);
  });
  test('the directory is warmed when the shell opens (BR-REC-203)', () => {
    const shell = [
      dirText('components/layout'),
      dirText('components/shell'),
      read('app/admin/layout.tsx'),
    ].join('\n');
    expect(shell + dirText('components/providers')).toMatch(
      /memberDirectoryQuery|useMemberDirectory/,
    );
  });
});

describe('BR-REC-201 one MemberSearch', () => {
  const ms = read('components/common/MemberSearch.tsx');
  test('component exists', () => expect(ms).not.toBe(''));
  test('has a Name / Email / Phone field picker', () => {
    expect(ms).toMatch(/Name/);
    expect(ms).toMatch(/Email/);
    expect(ms).toMatch(/Phone/);
  });
  test('keyboard follows the field (tel for phone, email for email)', () => {
    expect(ms).toMatch(/inputMode|type=/);
    expect(ms).toMatch(/tel|numeric/);
    expect(ms).toMatch(/email/);
  });
  test('is controlled by text, field, onChange', () => {
    expect(ms).toMatch(/\btext\b/);
    expect(ms).toMatch(/\bfield\b/);
    expect(ms).toMatch(/onChange/);
  });
  test('BR-REC-203 no debounce, no timer', () => {
    expect(ms).not.toMatch(/useDebounce|debounce|setTimeout/i);
  });
  test('Home and Members both use MemberSearch', () => {
    expect(read('components/pages/home/HomeSearch.tsx')).toMatch(/MemberSearch/);
    expect(read('components/pages/members/MemberListPanel.tsx')).toMatch(/MemberSearch/);
  });
});

describe('BR-REC-203 typing never calls the server', () => {
  for (const f of [
    'components/pages/home/HomeSearch.tsx',
    'components/pages/members/MemberListPanel.tsx',
  ]) {
    test(`${f}: no SearchField, no debounce, no per-text useMemberList`, () => {
      const t = read(f);
      expect(t).not.toMatch(/SearchField|debounce/i);
      expect(t).not.toMatch(/useMemberList\(\s*\{\s*q/);
      expect(t).toMatch(/searchMembers|useMemberDirectory|memberDirectoryQuery/);
    });
  }
  test('SearchField debounce plumbing is gone (file removed or without a timer)', () => {
    const t = read('components/common/SearchField.tsx');
    expect(t).not.toMatch(/debounceMs|setTimeout|debounce/i);
  });
  test('the duplicate-phone warning reads the directory (BR-REC-47)', () => {
    expect(fnBody(members, 'useDuplicatePhone')).toMatch(/directory|Directory/);
  });
});

describe('BR-REC-204 address state', () => {
  const list = read('components/pages/members/MemberListPanel.tsx');
  const params = read('lib/members/listParams.ts');
  test('q and by are nuqs params', () => {
    expect(params).toMatch(/\bq:/);
    expect(params).toMatch(/\bby:/);
  });
  test('history is replaced, never one entry per key', () => {
    expect(params + list).toMatch(/history:\s*['"]replace['"]/);
    expect(params + list).not.toMatch(/history:\s*['"]push['"]/);
  });
  test('Members uses by in the screen', () => expect(list).toMatch(/\bby\b/));
  test('results show 25 then Show more adds 25', () => {
    expect(dirText('components/pages/members')).toMatch(/Show more/);
  });
  test('empty state offers Add member and names the text', () => {
    expect(list).toMatch(/No member[^\n]*matches/);
    expect(list).toMatch(/Add member/);
  });
});

describe('BR-REC-183 tables from 1024 px', () => {
  const screens: [string, string][] = [
    ['Members', dirText('components/pages/members').replace(/\/\/.*$/gm, '')],
    ['Due list', dirText('components/pages/due')],
    [
      'Memberships ending',
      read('components/pages/members/EndingList.tsx') +
        read('components/pages/members/EndingSection.tsx'),
    ],
  ];
  for (const [name, text] of screens) {
    test(`${name} renders DataTable`, () => expect(text).toMatch(/<DataTable|DataTable\b/));
    test(`${name} switches at 1024 px (lg / min-width) and keeps rows below`, () => {
      expect(text).toMatch(/lg:|1024/);
      expect(text).toMatch(/Row\b/);
    });
  }
  test('Members table is not capped at 1280 px by a media query other than 1024', () => {
    expect(dirText('components/pages/members')).not.toMatch(/min-width:\s*(?!1024)\d+px/);
  });
  for (const f of [
    'components/pages/members/MemberListRow.tsx',
    'components/pages/due/DueRow.tsx',
    'components/pages/members/EndingRow.tsx',
  ]) {
    test(`${f}: no prefetch={false} on the row link`, () =>
      expect(read(f)).not.toMatch(/prefetch=\{false\}/));
  }
});
