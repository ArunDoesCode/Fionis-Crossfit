// Spec: docs/specs/member-records/ux.md (v5) BR-REC-177 "choice remembered", BR-REC-186, BR-REC-122 ("Sidebar remembered state").
// readSidebarOpen(): `data-sidebar` attribute on <html> first, else cookie `sidebar_state`, else viewport
// default (open from 1024 px, collapsed below). Returns true when the sidebar is open.
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSidebarOpen } from '@/components/shells/sidebarState';

type G = Record<string, unknown>;
const g = globalThis as unknown as G;
const saved = { document: g.document, window: g.window };

function stub(opts: { attr?: string | null; cookie?: string; width: number }) {
  g.document = {
    cookie: opts.cookie ?? '',
    documentElement: {
      getAttribute: (n: string) => (n === 'data-sidebar' ? (opts.attr ?? null) : null),
      dataset: opts.attr == null ? {} : { sidebar: opts.attr },
    },
  };
  g.window = {
    innerWidth: opts.width,
    matchMedia: (q: string) => {
      const min = q.match(/min-width:\s*(\d+)px/);
      const max = q.match(/max-width:\s*(\d+)px/);
      const matches =
        (!min || opts.width >= Number(min[1])) && (!max || opts.width <= Number(max[1]));
      return { matches, media: q, addEventListener() {}, removeEventListener() {} };
    },
  };
}

afterEach(() => {
  g.document = saved.document;
  g.window = saved.window;
});

describe('BR-REC-177 readSidebarOpen: the remembered choice', () => {
  test('BR-REC-177 attribute "open" wins over cookie false', () => {
    stub({ attr: 'open', cookie: 'sidebar_state=false', width: 900 });
    expect(readSidebarOpen()).toBe(true);
  });
  test('BR-REC-177 attribute "collapsed" wins over cookie true at 1440', () => {
    stub({ attr: 'collapsed', cookie: 'sidebar_state=true', width: 1440 });
    expect(readSidebarOpen()).toBe(false);
  });
  test('BR-REC-177 no attribute + cookie false -> collapsed (login -> /admin client navigation)', () => {
    stub({ attr: null, cookie: 'sidebar_state=false', width: 1440 });
    expect(readSidebarOpen()).toBe(false);
  });
  test('BR-REC-177 no attribute + cookie true -> open even on a small screen', () => {
    stub({ attr: null, cookie: 'sidebar_state=true', width: 900 });
    expect(readSidebarOpen()).toBe(true);
  });
  test('BR-REC-177 cookie found among other cookies', () => {
    stub({ attr: null, cookie: 'a=1; sidebar_state=false; b=2', width: 1440 });
    expect(readSidebarOpen()).toBe(false);
  });
  test('BR-REC-177 no attribute, no cookie, 1280 px -> open (viewport default)', () => {
    stub({ attr: null, width: 1280 });
    expect(readSidebarOpen()).toBe(true);
  });
  test('BR-REC-177 no attribute, no cookie, 1024 px -> open (from 1024 px)', () => {
    stub({ attr: null, width: 1024 });
    expect(readSidebarOpen()).toBe(true);
  });
  test('BR-REC-177 no attribute, no cookie, 900 px -> collapsed (icons below 1024 px)', () => {
    stub({ attr: null, width: 900 });
    expect(readSidebarOpen()).toBe(false);
  });
  test('BR-REC-177 SSR: no document and no window -> does not throw, returns a boolean', () => {
    g.document = undefined;
    g.window = undefined;
    const v = readSidebarOpen();
    expect(typeof v).toBe('boolean');
  });
});

describe('BR-REC-177 the pre-paint script writes the values the spec names', () => {
  test('BR-REC-177 script sets data-sidebar to "open" or "collapsed"', async () => {
    const { SIDEBAR_STATE_SCRIPT } = await import('@/components/shells/sidebarState');
    expect(SIDEBAR_STATE_SCRIPT).toContain("'open'");
    expect(SIDEBAR_STATE_SCRIPT).not.toContain("'expanded'");
    expect(SIDEBAR_STATE_SCRIPT).toContain("'collapsed'");
  });
});

describe('BR-REC-186 / 122 SideNav source', () => {
  const nav = readFileSync(
    join(import.meta.dir, '../../src/components/shells/SideNav.tsx'),
    'utf8',
  );
  test('BR-REC-186 the "F" placeholder uses bg-primary and text-primary-foreground (AA)', () => {
    expect(nav).toMatch(/>\s*F\s*</);
    expect(nav).toContain('bg-primary');
    expect(nav).toContain('text-primary-foreground');
  });
  test('BR-REC-122 collapsed icon buttons are 44 px (size-11)', () => {
    expect(nav).toContain('size-11');
  });
});
