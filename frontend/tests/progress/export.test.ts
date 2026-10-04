// Spec: docs/specs/member-records/progress.md (v2)
//   BR-REC-24  everything is exportable to CSV (members, memberships, measurements).
//   BR-REC-119 files are named like measurements-2026-10-03.csv, start downloading within 1 second and stream, so
//              the app stays usable.
//   P10        E39 sends the attachment headers before reading the rows; "S18 first makes sure the sign-in is fresh
//              (one E05 call), then starts a plain browser download".
//   S18        three rows Members / Memberships / Measurements, each [Download CSV].
// Interface: .pipeline/member-records-progress/contract.md "Admin app" (S18) and "Admin app interfaces" —
//   `@/lib/api/progress/fetchers`: `exportHref(file)` = `NEXT_PUBLIC_API_URL` + `/exports/<file>`
//   (`/api/exports/members.csv`); `downloadExport(file)`: one E05 call (GET /api/auth/me) through `api`
//   (refreshes the sign-in when needed), then a plain browser download of the E39 URL (hidden
//   `<a href download>` click; no fetch of the body).
//   `bun test` has no DOM, so a minimal `document` stand-in records the anchor that is created and clicked.
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { API_ROUTES } from '@/lib/api/routes';
import { errorResponse, installFetch, jsonResponse, setAuthEnv } from '../auth/helpers';

type ExportFile = 'members.csv' | 'memberships.csv' | 'measurements.csv';

interface Fetchers {
  exportHref(file: ExportFile): string;
  downloadExport(file: ExportFile): Promise<void>;
}

const FILES: ExportFile[] = ['members.csv', 'memberships.csv', 'measurements.csv'];

let fetchers: Fetchers;
let restoreEnv: () => void;
let fetchSpy: ReturnType<typeof installFetch> | undefined;
let dom: FakeDom | undefined;

beforeAll(async () => {
  restoreEnv = setAuthEnv();
  fetchers = (await import('@/lib/api/progress/fetchers')) as unknown as Fetchers;
});

afterEach(() => {
  fetchSpy?.restore();
  fetchSpy = undefined;
  dom?.restore();
  dom = undefined;
});

afterAll(() => {
  restoreEnv();
});

/** One thing the test saw happen, in order: a request, or a click on an anchor. */
type Event = string;

class FakeAnchor {
  readonly tag: string;
  readonly style: Record<string, string> = {};
  target = '';
  hidden = false;
  clicks = 0;
  private readonly attrs: Record<string, string> = {};
  private hrefValue = '';
  private downloadAssigned = false;
  private downloadValue = '';

  constructor(
    tag: string,
    private readonly log: Event[],
  ) {
    this.tag = tag;
  }

  get href(): string {
    return this.hrefValue;
  }

  set href(value: string) {
    this.hrefValue = String(value);
  }

  get download(): string {
    return this.downloadValue;
  }

  /** Any assignment counts, even the empty string (which is how a browser spells "download"). */
  set download(value: string | boolean) {
    this.downloadAssigned = true;
    this.downloadValue = String(value);
  }

  setAttribute(name: string, value: string) {
    this.attrs[name] = String(value);
    if (name === 'href') this.hrefValue = String(value);
    if (name === 'download') {
      this.downloadAssigned = true;
      this.downloadValue = String(value);
    }
  }

  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attrs[name];
  }

  click() {
    this.clicks += 1;
    this.log.push(`click ${this.hrefValue}`);
  }

  remove() {}
  addEventListener() {}
  removeEventListener() {}

  /** Whether the anchor asks the browser to download (a `download` attribute or property was set). */
  get asksDownload(): boolean {
    return this.downloadAssigned;
  }
}

interface FakeDom {
  anchors: FakeAnchor[];
  log: Event[];
  restore(): void;
}

/** A minimal `document`: creating an `a`, adding it to the body, clicking it. Nothing else is needed. */
function installFakeDom(log: Event[]): FakeDom {
  const anchors: FakeAnchor[] = [];
  const original = (globalThis as { document?: unknown }).document;
  const body = {
    appendChild: <T>(node: T) => node,
    append: () => {},
    removeChild: <T>(node: T) => node,
    prepend: () => {},
    contains: () => true,
  };
  (globalThis as { document?: unknown }).document = {
    body,
    documentElement: body,
    createElement: (tag: string) => {
      const element = new FakeAnchor(tag, log);
      if (tag.toLowerCase() === 'a') anchors.push(element);
      return element;
    },
  };
  return {
    anchors,
    log,
    restore: () => {
      if (original === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = original;
    },
  };
}

const pathOf = (url: string) => new URL(url, 'http://gym.test').pathname;
const AUTH_ME = `/api${API_ROUTES.AUTH.ME}`;
const REFRESH = `/api${API_ROUTES.AUTH.REFRESH}`;

const meOk = () =>
  jsonResponse(200, {
    success: true,
    data: { username: 'owner', remember: true, expiresAt: '2026-10-10T10:00:00Z' },
  });

/** A server where E05 answers like the API; the log records every request in order. */
function startServer(
  log: Event[],
  handler: (call: { url: string; method: string }) => Response | undefined = () => undefined,
) {
  return installFetch((call) => {
    log.push(`${call.method} ${pathOf(call.url)}`);
    return (
      handler(call) ??
      (pathOf(call.url) === AUTH_ME
        ? meOk()
        : jsonResponse(404, { success: false, message: 'no', code: 'NOT_FOUND' }))
    );
  });
}

describe('BR-REC-119 exportHref', () => {
  test.each([
    ['members.csv', '/api/exports/members.csv'],
    ['memberships.csv', '/api/exports/memberships.csv'],
    ['measurements.csv', '/api/exports/measurements.csv'],
  ] as [ExportFile, string][])('BR-REC-119 exportHref(%s) is "%s"', (file, expected) => {
    expect(fetchers.exportHref(file)).toBe(expected);
  });

  test('BR-REC-119 every address ends in the file name the API serves (so the saved name is <file>-<date>.csv)', () => {
    for (const file of FILES) expect(fetchers.exportHref(file).endsWith(`/${file}`)).toBe(true);
  });
});

describe('P10 downloadExport: one sign-in check, then a plain browser download', () => {
  test.each(FILES)(
    'P10 %s: the sign-in is checked once with E05 (GET /api/auth/me)',
    async (file) => {
      const log: Event[] = [];
      dom = installFakeDom(log);
      fetchSpy = startServer(log);
      await fetchers.downloadExport(file);
      const calls = fetchSpy.calls.filter((call) => pathOf(call.url) === AUTH_ME);
      expect(calls.length).toBe(1);
      expect(calls[0]?.method).toBe('GET');
    },
  );

  test.each(FILES)(
    'P10 %s: an anchor with the E39 address and a download request is clicked once',
    async (file) => {
      const log: Event[] = [];
      dom = installFakeDom(log);
      fetchSpy = startServer(log);
      await fetchers.downloadExport(file);
      expect(dom.anchors.length).toBe(1);
      const anchor = dom.anchors[0];
      expect(anchor?.href).toBe(fetchers.exportHref(file));
      expect(anchor?.asksDownload).toBe(true);
      expect(anchor?.clicks).toBe(1);
    },
  );

  test('P10 the sign-in check finishes before the download starts', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    fetchSpy = startServer(log);
    await fetchers.downloadExport('measurements.csv');
    expect(log).toEqual([`GET ${AUTH_ME}`, `click ${fetchers.exportHref('measurements.csv')}`]);
  });

  test('BR-REC-119 the file itself is not fetched by the app (the browser streams it): no request to /api/exports', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    fetchSpy = startServer(log);
    await fetchers.downloadExport('members.csv');
    expect(
      fetchSpy.calls.filter((call) => pathOf(call.url).startsWith('/api/exports')).length,
    ).toBe(0);
    expect(fetchSpy.calls.length).toBe(1);
  });

  test('P10 an expired sign-in is refreshed first (E05 401, one refresh, E05 again), then the download starts', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    let refreshed = false;
    fetchSpy = startServer(log, (call) => {
      const path = pathOf(call.url);
      if (path === REFRESH) {
        refreshed = true;
        return jsonResponse(200, { success: true, data: { expiresAt: '2026-10-10T10:00:00Z' } });
      }
      if (path === AUTH_ME && !refreshed)
        return errorResponse(401, 'UNAUTHORIZED', 'Sign in required');
      return undefined;
    });
    await fetchers.downloadExport('memberships.csv');
    expect(log).toEqual([
      `GET ${AUTH_ME}`,
      `POST ${REFRESH}`,
      `GET ${AUTH_ME}`,
      `click ${fetchers.exportHref('memberships.csv')}`,
    ]);
  });

  test('P10 two downloads in a row each check the sign-in and each start their own download', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    fetchSpy = startServer(log);
    await fetchers.downloadExport('members.csv');
    await fetchers.downloadExport('measurements.csv');
    expect(log).toEqual([
      `GET ${AUTH_ME}`,
      `click ${fetchers.exportHref('members.csv')}`,
      `GET ${AUTH_ME}`,
      `click ${fetchers.exportHref('measurements.csv')}`,
    ]);
  });

  test('P10 when the sign-in check fails (server error) no download starts', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    fetchSpy = startServer(log, (call) =>
      pathOf(call.url) === AUTH_ME
        ? errorResponse(500, 'INTERNAL_ERROR', 'Something went wrong')
        : undefined,
    );
    await fetchers.downloadExport('members.csv').catch(() => undefined);
    expect(dom.anchors.reduce((sum, anchor) => sum + anchor.clicks, 0)).toBe(0);
    expect(log.some((entry) => entry.startsWith('click'))).toBe(false);
  });

  test('P10 when the sign-in cannot be refreshed no download starts', async () => {
    const log: Event[] = [];
    dom = installFakeDom(log);
    fetchSpy = startServer(log, (call) => {
      const path = pathOf(call.url);
      if (path === REFRESH) return errorResponse(401, 'SESSION_EXPIRED', 'Sign in again');
      if (path === AUTH_ME) return errorResponse(401, 'UNAUTHORIZED', 'Sign in required');
      return undefined;
    });
    await fetchers.downloadExport('members.csv').catch(() => undefined);
    expect(log.some((entry) => entry.startsWith('click'))).toBe(false);
  });
});
