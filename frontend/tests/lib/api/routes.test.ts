// Spec: docs/specs/member-records.md, index "Parallel build plan" row 0 ("full `API_ROUTES`") and
// "Contract files that must exist before streams A–F start" (`frontend/src/lib/api/routes.ts`);
// endpoint list E01–E40: docs/specs/member-records/api-contract.md.
// Interface: .pipeline/member-records-foundation/contract.md, "Frontend shared modules" (lib/api/routes.ts):
// a nested `as const` object whose leaves are path templates relative to `/api`, `:param` placeholders
// spelled exactly as in `backend/.contracts/api-manifest.json`, one leaf per manifest route (E01–E40 + health).
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_ROUTES } from '@/lib/api/routes';

// Paths of E01–E40 as the api-contract.md endpoint table writes them (without the `/api` prefix).
const SPEC_PATHS: Record<string, string> = {
  E01: '/auth/login',
  E02: '/auth/refresh',
  E03: '/auth/logout',
  E04: '/auth/logout-all',
  E05: '/auth/me',
  E06: '/auth/password',
  E07: '/settings',
  E08: '/settings',
  E09: '/assessment-types',
  E10: '/assessment-types',
  E11: '/assessment-types/:typeId',
  E12: '/assessment-types/order',
  E13: '/assessment-types/:typeId/metrics',
  E14: '/metrics/:metricId',
  E15: '/assessment-types/:typeId/metric-order',
  E16: '/members',
  E17: '/members',
  E18: '/members/:memberId',
  E19: '/members/:memberId',
  E20: '/members/:memberId/archive',
  E21: '/members/:memberId/restore',
  E22: '/members/:memberId/periods',
  E23: '/members/:memberId/periods/:periodId',
  E24: '/memberships/ending',
  E25: '/members/:memberId/entry-form',
  E26: '/assessments',
  E27: '/assessments',
  E28: '/assessments/:assessmentId',
  E29: '/assessments/:assessmentId',
  E30: '/assessments/:assessmentId',
  E31: '/due',
  E32: '/members/:memberId/due',
  E33: '/members/:memberId/due-actions/:typeId',
  E34: '/members/:memberId/due-actions/:typeId',
  E35: '/members/:memberId/report-card',
  E36: '/reports/progress',
  E37: '/reports/leaderboard',
  E38: '/reports/active-by-plan',
  E39: '/exports/:file',
  E40: '/vitals',
};

type Leaf = { keyPath: string; value: unknown };

// Walks the nested object; anything that is not a plain object is a leaf.
const collectLeaves = (node: unknown, keyPath = 'API_ROUTES'): Leaf[] => {
  if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
    return Object.entries(node).flatMap(([key, child]) =>
      collectLeaves(child, `${keyPath}.${key}`),
    );
  }
  return [{ keyPath, value: node }];
};

const leaves = collectLeaves(API_ROUTES);
const leafValues = leaves.map((leaf) => leaf.value);

const manifestPaths = (): string[] => {
  const file = join(import.meta.dir, '../../../../backend/.contracts/api-manifest.json');
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    baseUrl: string;
    routes: { path: string }[];
  };
  expect(manifest.baseUrl).toBe('/api');
  return manifest.routes.map((route) => route.path.slice(manifest.baseUrl.length));
};

describe('API_ROUTES shape', () => {
  test('API_ROUTES is a nested object, not a flat map and not an array', () => {
    expect(typeof API_ROUTES).toBe('object');
    expect(Array.isArray(API_ROUTES)).toBe(false);
    const groups = Object.values(API_ROUTES).filter(
      (value) => typeof value === 'object' && value !== null,
    );
    expect(groups.length).toBeGreaterThan(0);
  });

  test('API_ROUTES leaves are all strings', () => {
    const notStrings = leaves
      .filter((leaf) => typeof leaf.value !== 'string')
      .map((leaf) => leaf.keyPath);
    expect(notStrings).toEqual([]);
  });

  test('API_ROUTES paths are relative to /api: they start with one slash and not with /api', () => {
    const bad = leaves
      .filter((leaf) => typeof leaf.value === 'string')
      .filter((leaf) => !/^\/(?!api(\/|$))[^/]/.test(leaf.value as string))
      .map((leaf) => `${leaf.keyPath} = ${leaf.value}`);
    expect(bad).toEqual([]);
  });

  test('API_ROUTES paths have no trailing slash, query string or spaces', () => {
    const bad = leaves
      .filter((leaf) => typeof leaf.value === 'string')
      .filter((leaf) => /[/?#\s]$|[?#\s]/.test(leaf.value as string))
      .map((leaf) => `${leaf.keyPath} = ${leaf.value}`);
    expect(bad).toEqual([]);
  });

  test('API_ROUTES placeholders are written :name with a plain camelCase name', () => {
    const bad = leaves
      .flatMap((leaf) => String(leaf.value).split('/'))
      .filter((segment) => segment.includes(':') || segment.includes('{') || segment.includes('['))
      .filter((segment) => !/^:[a-z][A-Za-z]*$/.test(segment));
    expect(bad).toEqual([]);
  });
});

describe('API_ROUTES covers the endpoint list of api-contract.md (E01–E40)', () => {
  test.each(Object.entries(SPEC_PATHS))('%s has a leaf for %s', (_id, path) => {
    expect(leafValues).toContain(path);
  });

  test('every spec endpoint path is present, none missing', () => {
    const missing = [...new Set(Object.values(SPEC_PATHS))].filter(
      (path) => !leafValues.includes(path),
    );
    expect(missing).toEqual([]);
  });
});

describe('API_ROUTES matches the published API manifest', () => {
  test('every route in api-manifest.json has a leaf (including the health check)', () => {
    const paths = manifestPaths();
    expect(paths.length).toBeGreaterThanOrEqual(41);
    const missing = [...new Set(paths)].filter((path) => !leafValues.includes(path));
    expect(missing).toEqual([]);
  });

  test('the health check path is in API_ROUTES', () => {
    expect(leafValues).toContain('/health');
  });

  test('API_ROUTES has no leaf that is not a manifest route (no stale or invented paths)', () => {
    const known = new Set(manifestPaths());
    const extra = leaves
      .filter((leaf) => !known.has(String(leaf.value)))
      .map((leaf) => `${leaf.keyPath} = ${String(leaf.value)}`);
    expect(extra).toEqual([]);
  });

  test('every endpoint of the spec is also in the manifest (spec and contract agree)', () => {
    const known = new Set(manifestPaths());
    const notPublished = Object.entries(SPEC_PATHS)
      .filter(([, path]) => !known.has(path))
      .map(([id, path]) => `${id} ${path}`);
    expect(notPublished).toEqual([]);
  });
});
