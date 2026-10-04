// Spec: docs/specs/member-records/due-list.md (v2)
//   BR-REC-101 / C11 Home shows the first 5 rows of each section: `useDuePreview(status)` is E31 with pageSize 5.
//   BR-REC-104 / C11 S3 loads 25 per page and appends ("Show more"): `useDueList(status, typeId)` is an infinite
//              query; the assessment filter is part of what it reads.
//   BR-REC-103 the member page block reads that member's E32 lines: `useMemberDue(memberId)`.
// Interface: .pipeline/member-records-due-list/contract.md "Admin app interfaces" — `@/lib/api/due/queries`:
//   `dueKeys`, hooks `useDuePreview(status)` (pageSize 5), `useDueList(status, typeId)` (infinite, 25/page),
//   `useMemberDue(memberId)`.
// How: there is no DOM in `bun test`, so each hook is called while rendering to a string with the server renderer
//   (react-dom/server). Nothing is fetched on the server render, so a hook can only answer from the entry of the
//   query cache it asks for. The cache is seeded with different, marked answers for the page sizes, the tabs and the
//   filters; which marker the hook returns shows which entry it reads (page size, tab, filter, member).
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { errorResponse, installFetch, setAuthEnv } from '../auth/helpers';
import {
  type DueListStatus,
  dueRow,
  MEMBER_ANITA,
  MEMBER_SURYA,
  memberLine,
  TYPE_BODY,
  TYPE_FITNESS,
} from './helpers';

interface DueKeys {
  list(status: DueListStatus, typeId: string | null, pageSize: number): readonly unknown[];
  infinite(status: DueListStatus, typeId: string | null): readonly unknown[];
  member(memberId: string): readonly unknown[];
}

interface HooksModule {
  dueKeys: DueKeys;
  useDuePreview(status: DueListStatus): unknown;
  useDueList(status: DueListStatus, typeId: string | null): unknown;
  useMemberDue(memberId: string): unknown;
}

let hooks: HooksModule;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  // A server render never fetches; if a hook did, it would get an error instead of the network.
  fetchSpy = installFetch(() => errorResponse(500, 'INTERNAL_ERROR'));
  hooks = (await import('@/lib/api/due/queries')) as unknown as HooksModule;
});

afterAll(() => {
  fetchSpy?.restore();
  restoreEnv();
});

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });

/** Runs `useIt` once inside the app's query provider and returns what it returned. */
function callHook<T>(client: QueryClient, useIt: () => T): T {
  let captured: T | undefined;
  function Probe() {
    captured = useIt();
    return null;
  }
  renderToString(createElement(QueryClientProvider, { client }, createElement(Probe)));
  return captured as T;
}

/** JSON of a hook result, safe against cycles; functions are left out. */
function dump(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (typeof inner === 'object' && inner !== null) {
      if (seen.has(inner)) return undefined;
      seen.add(inner);
    }
    return inner;
  });
}

const listBody = (marker: string, total = 12) => ({
  success: true,
  data: [dueRow({ fullName: marker })],
  meta: { page: 1, pageSize: 5, total, totalPages: Math.ceil(total / 5) },
});

const infiniteData = (marker: string) => ({ pages: [listBody(marker, 60)], pageParams: [1] });

describe('BR-REC-101 / C11 useDuePreview: the first 5 rows of a Home section', () => {
  test('Overdue reads the page-size-5 entry of the overdue list (not another page size or tab)', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.list('overdue', null, 5), listBody('five-overdue'));
    client.setQueryData(hooks.dueKeys.list('overdue', null, 25), listBody('twentyfive-overdue'));
    client.setQueryData(hooks.dueKeys.list('upcoming', null, 5), listBody('five-soon'));
    const text = dump(callHook(client, () => hooks.useDuePreview('overdue')));
    expect(text).toContain('five-overdue');
    expect(text).not.toContain('twentyfive-overdue');
    expect(text).not.toContain('five-soon');
  });

  test('Due soon reads the page-size-5 entry of the upcoming list', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.list('overdue', null, 5), listBody('five-overdue'));
    client.setQueryData(hooks.dueKeys.list('upcoming', null, 5), listBody('five-soon'));
    const text = dump(callHook(client, () => hooks.useDuePreview('upcoming')));
    expect(text).toContain('five-soon');
    expect(text).not.toContain('five-overdue');
  });

  test('BR-REC-101 Home has no assessment filter: it never reads a filtered entry', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.list('overdue', null, 5), listBody('all-types'));
    client.setQueryData(hooks.dueKeys.list('overdue', TYPE_FITNESS, 5), listBody('fitness-only'));
    const text = dump(callHook(client, () => hooks.useDuePreview('overdue')));
    expect(text).toContain('all-types');
    expect(text).not.toContain('fitness-only');
  });

  test("BR-REC-101 the section count is the answer's meta.total (it is in what the hook returns)", () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.list('overdue', null, 5), listBody('five-overdue', 12));
    const text = dump(callHook(client, () => hooks.useDuePreview('overdue')));
    expect(text).toContain('"total":12');
  });
});

describe('BR-REC-104 / C11 useDueList: S3, 25 per page, one assessment or all', () => {
  test('"All" reads the infinite list of that tab with no filter', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.infinite('overdue', null), infiniteData('all-overdue'));
    client.setQueryData(
      hooks.dueKeys.infinite('overdue', TYPE_FITNESS),
      infiniteData('fitness-overdue'),
    );
    client.setQueryData(hooks.dueKeys.infinite('upcoming', null), infiniteData('all-soon'));
    const text = dump(callHook(client, () => hooks.useDueList('overdue', null)));
    expect(text).toContain('all-overdue');
    expect(text).not.toContain('fitness-overdue');
    expect(text).not.toContain('all-soon');
  });

  test("an assessment filter reads that assessment's own infinite list", () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.infinite('overdue', null), infiniteData('all-overdue'));
    client.setQueryData(
      hooks.dueKeys.infinite('overdue', TYPE_FITNESS),
      infiniteData('fitness-overdue'),
    );
    client.setQueryData(hooks.dueKeys.infinite('overdue', TYPE_BODY), infiniteData('body-overdue'));
    const text = dump(callHook(client, () => hooks.useDueList('overdue', TYPE_FITNESS)));
    expect(text).toContain('fitness-overdue');
    expect(text).not.toContain('all-overdue');
    expect(text).not.toContain('body-overdue');
  });

  test('the Due soon tab reads the upcoming infinite list', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.infinite('overdue', null), infiniteData('all-overdue'));
    client.setQueryData(hooks.dueKeys.infinite('upcoming', null), infiniteData('all-soon'));
    const text = dump(callHook(client, () => hooks.useDueList('upcoming', null)));
    expect(text).toContain('all-soon');
    expect(text).not.toContain('all-overdue');
  });

  test('it does not read the one-page entries Home uses', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.list('overdue', null, 5), listBody('home-five'));
    client.setQueryData(hooks.dueKeys.list('overdue', null, 25), listBody('home-twentyfive'));
    client.setQueryData(hooks.dueKeys.infinite('overdue', null), infiniteData('s3-pages'));
    const text = dump(callHook(client, () => hooks.useDueList('overdue', null)));
    expect(text).toContain('s3-pages');
    expect(text).not.toContain('home-five');
    expect(text).not.toContain('home-twentyfive');
  });
});

describe('BR-REC-103 useMemberDue: the Assessments block of one member', () => {
  test("reads that member's own entry", () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.member(MEMBER_SURYA), {
      success: true,
      data: [memberLine({ typeName: 'surya-lines' })],
    });
    client.setQueryData(hooks.dueKeys.member(MEMBER_ANITA), {
      success: true,
      data: [memberLine({ typeName: 'anita-lines' })],
    });
    const text = dump(callHook(client, () => hooks.useMemberDue(MEMBER_SURYA)));
    expect(text).toContain('surya-lines');
    expect(text).not.toContain('anita-lines');
  });

  test('another member reads another entry', () => {
    const client = newClient();
    client.setQueryData(hooks.dueKeys.member(MEMBER_SURYA), {
      success: true,
      data: [memberLine({ typeName: 'surya-lines' })],
    });
    client.setQueryData(hooks.dueKeys.member(MEMBER_ANITA), {
      success: true,
      data: [memberLine({ typeName: 'anita-lines' })],
    });
    const text = dump(callHook(client, () => hooks.useMemberDue(MEMBER_ANITA)));
    expect(text).toContain('anita-lines');
    expect(text).not.toContain('surya-lines');
  });
});
