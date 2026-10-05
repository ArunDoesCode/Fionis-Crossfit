// Spec: docs/specs/member-records/performance.md BR-REC-208, 209, 210, 211 (U6, owner scope cut).
// Config and source-text checks; the runtime parts are in the manual list.
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { entryFormQueryOptions, invalidateAssessmentData } from '@/lib/api/assessments/queries';
import { getQueryClient } from '@/lib/queryClient';

const root = join(import.meta.dir, '..', '..');
const src = join(root, 'src');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const f = join(dir, n);
    return statSync(f).isDirectory() ? walk(f) : [f];
  });
const sources = walk(src).filter((f) => /\.(ts|tsx)$/.test(f));

describe('BR-REC-209 freshness', () => {
  test('BR-REC-209 no refetch on window focus', () => {
    expect(getQueryClient().getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });
  test('BR-REC-209 default fresh time is 30 s', () => {
    expect(getQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
  test('BR-REC-209 entry forms are always fresh', () => {
    expect(entryFormQueryOptions('m', 't', '2026-01-01').staleTime).toBe(0);
  });
  test('BR-REC-209 an assessment save refreshes member list + due lists, never the whole members root', async () => {
    const keys: unknown[][] = [];
    await invalidateAssessmentData({
      invalidateQueries: (async (f?: { queryKey?: unknown[] }) => {
        if (f?.queryKey) keys.push([...f.queryKey]);
      }) as never,
    });
    expect(keys.some((k) => k.length === 1 && k[0] === 'members')).toBe(false);
    expect(keys.some((k) => k[0] === 'members' && k[1] === 'list')).toBe(true);
    expect(keys.some((k) => k[0] === 'due')).toBe(true);
  });
});

describe('BR-REC-210 bundle', () => {
  const importsOf = (file: string): string[] =>
    [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1] as string,
    );
  const resolve = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/')
      ? join(src, spec.slice(2))
      : spec.startsWith('.')
        ? join(dirname(from), spec)
        : null;
    if (!base) return null;
    for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')])
      if (existsSync(c) && statSync(c).isFile()) return c;
    return null;
  };
  test('BR-REC-210 lib/api/client.ts import graph has no zod', () => {
    const seen = new Set<string>();
    const bad: string[] = [];
    const visit = (f: string) => {
      if (seen.has(f)) return;
      seen.add(f);
      for (const s of importsOf(f)) {
        if (s === 'zod' || s.startsWith('zod/')) bad.push(f);
        const r = resolve(f, s);
        if (r) visit(r);
      }
    };
    visit(join(src, 'lib/api/client.ts'));
    expect(bad).toEqual([]);
  });
  test('BR-REC-210 CI frontend job runs next build', () => {
    const ci = readFileSync(join(root, '..', '.github/workflows/ci.yml'), 'utf8');
    const job = ci.slice(ci.indexOf('\n  frontend:'), ci.indexOf('\n  member:'));
    expect(job).toMatch(/next build|bun run build/);
  });
  test('BR-REC-210 zustand and lib/store are gone (no screen uses them)', () => {
    expect(read('package.json')).not.toContain('"zustand"');
    expect(existsSync(join(src, 'lib/store'))).toBe(false);
  });
  test('BR-REC-210 date-fns stays', () => {
    expect(read('package.json')).toContain('"date-fns"');
  });
});

describe('BR-REC-211 hot paths', () => {
  test('BR-REC-211 icons are tree-shaken via optimizePackageImports', () => {
    const cfg = read('next.config.ts');
    expect(cfg).toContain('optimizePackageImports');
    expect(cfg).toContain('@hugeicons/core-free-icons');
  });
  test('BR-REC-211 no X-Powered-By', () => {
    expect(read('next.config.ts')).toMatch(/poweredByHeader:\s*false/);
  });
  test('BR-REC-211 five reads of "today" build at most one Intl.DateTimeFormat', async () => {
    const Original = Intl.DateTimeFormat;
    let built = 0;
    const Spy = function (this: unknown, ...args: ConstructorParameters<typeof Original>) {
      built += 1;
      return new Original(...args);
    } as unknown as typeof Original;
    Object.setPrototypeOf(Spy, Original);
    Object.defineProperty(Spy, 'prototype', { value: Original.prototype });
    Intl.DateTimeFormat = Spy;
    try {
      // a fresh copy of the module, so its module-level cache starts empty and its Intl lookup sees the spy
      const mod = (await import(`@/lib/members/useToday?u6=${Math.random()}`)) as {
        gymTodayNow(): string;
      };
      for (let i = 0; i < 5; i++) mod.gymTodayNow();
    } finally {
      Intl.DateTimeFormat = Original;
    }
    expect(built).toBeLessThanOrEqual(1);
  });
  test('BR-REC-211 draft autosave is throttled to >= 300 ms and flushed on pagehide', () => {
    const a = read('src/lib/assessments/useDraftAutosave.ts');
    expect(a).toContain('pagehide');
    const delays = [
      ...a.matchAll(/(?:setTimeout|AUTOSAVE\w*|THROTTLE\w*|DEBOUNCE\w*)[^\n]*?(\d[\d_]*)/g),
    ].map((m) => Number((m[1] as string).replace(/_/g, '')));
    expect(delays.some((n) => n >= 300)).toBe(true);
  });
  test('BR-REC-211 globals.css switches the backdrop filter off for all four overlay slots', () => {
    const css = read('src/app/globals.css');
    for (const slot of ['sheet', 'dialog', 'alert-dialog', 'drawer']) {
      const rule = new RegExp(
        `\\[data-slot="${slot}-overlay"\\][^{}]*\\{[^}]*backdrop-filter:\\s*none`,
      );
      expect(css, slot).toMatch(rule);
    }
  });
});

describe('BR-REC-208 prefetch', () => {
  test('BR-REC-208 no prefetch={false} on row and member links', () => {
    const offenders = sources.filter((f) =>
      read(f.slice(root.length + 1)).includes('prefetch={false}'),
    );
    expect(offenders.map((f) => f.slice(root.length + 1))).toEqual([]);
  });
});
