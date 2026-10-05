// Spec: docs/specs/member-records/members.md BR-REC-203, 204 ("Build clarifications (U5)").
// Data-flow guards (query keys, invalidation, no server call while typing). No look tests (D-038): markup,
// control and layout checks were removed. Behaviour that needs a browser is manual-only.

import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsonResponse, setAuthEnv } from '../auth/helpers';
import { appLikeClient, callHook, flush, recordingFetch } from '../due/hookHarness';

const SRC = join(import.meta.dir, '..', '..', 'src');
const read = (rel: string): string =>
  existsSync(join(SRC, rel)) ? readFileSync(join(SRC, rel), 'utf8') : '';
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
    const warm = read('app/(app)/admin/_components/DirectoryWarmup.tsx');
    expect(warm).toMatch(/memberDirectoryQuery|useMemberDirectory/);
    expect(read('app/(app)/admin/layout.tsx')).toContain('DirectoryWarmup');
  });
});

describe('BR-REC-203 MemberSearch filters locally', () => {
  test('BR-REC-203 no debounce, no timer', () => {
    expect(read('components/common/MemberSearch.tsx')).not.toMatch(
      /useDebounce|debounce|setTimeout/i,
    );
  });
});

describe('BR-REC-203 typing never calls the server', () => {
  for (const f of [
    'components/views/home/HomeView.tsx',
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
});

describe('BR-REC-208 prefetch', () => {
  for (const f of [
    'components/pages/members/MemberDirectoryResults.tsx',
    'components/pages/due/DueRow.tsx',
    'components/pages/members/EndingRow.tsx',
  ]) {
    test(`${f}: no prefetch={false} on the row link`, () =>
      expect(read(f)).not.toMatch(/prefetch=\{false\}/));
  }
});
