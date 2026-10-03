import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createApp } from "../../src/app";
import { getRegistry } from "../../src/lib/route-registry";
import {
  API_BASE_PATH,
  END_POINTS,
  MAIN_ROUTES,
} from "../../src/routes/end-points";

const CONTRACT_DIR = join(import.meta.dir, "../../.contracts");

type Manifest = { routes: { id: string; method: string; path: string }[] };
type OpenApi = { paths: Record<string, Record<string, unknown>> };

/** Every `<base><feature mount><endpoint>` declared in end-points.ts. */
function declaredPaths(): string[] {
  const paths: string[] = [];
  for (const [feature, endpoints] of Object.entries(END_POINTS)) {
    const mount = MAIN_ROUTES[feature as keyof typeof MAIN_ROUTES];
    for (const sub of Object.values(endpoints)) {
      const tail = sub === "/" ? "" : sub;
      paths.push(`${API_BASE_PATH}${mount}${tail}`);
    }
  }
  return paths;
}

describe("route drift", () => {
  test("every MAIN_ROUTES feature has END_POINTS entries and vice versa", () => {
    expect(Object.keys(END_POINTS).sort()).toEqual(
      Object.keys(MAIN_ROUTES).sort(),
    );
  });

  test("every route declared in end-points.ts is registered in the route registry", async () => {
    // Importing the app loads every router, which registers its descriptors.
    createApp();
    const registered = new Set(getRegistry().map((r) => r.path));

    for (const path of declaredPaths()) {
      expect(registered.has(path)).toBe(true);
    }
  });

  test("every registered route is declared in end-points.ts", () => {
    createApp();
    const declared = new Set(declaredPaths());

    for (const route of getRegistry()) {
      expect(declared.has(route.path)).toBe(true);
    }
  });

  test("every registered route is reachable (not 404) through the app", async () => {
    const app = createApp();
    for (const route of getRegistry()) {
      const concrete = route.path.replace(/:[A-Za-z0-9_]+/g, "1");
      const res = await app.request(concrete, { method: route.method });
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as {
        code?: string;
      } | null;
      expect(
        res.status === 404 && body?.code === "NOT_FOUND",
        `${route.method} ${route.path} is registered but not mounted`,
      ).toBe(false);
    }
  });

  test("every declared route appears in the generated api-manifest.json", async () => {
    createApp();
    const manifest = (await Bun.file(
      join(CONTRACT_DIR, "api-manifest.json"),
    ).json()) as Manifest;
    const ids = new Set(manifest.routes.map((r) => r.path));

    for (const path of declaredPaths()) {
      expect(ids.has(path)).toBe(true);
    }
  });

  test("every declared route appears in the generated openapi.json", async () => {
    const openapi = (await Bun.file(
      join(CONTRACT_DIR, "openapi.json"),
    ).json()) as OpenApi;
    // OpenAPI uses `{param}` where Hono uses `:param`.
    const toOpenApi = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

    for (const route of getRegistry()) {
      const item = openapi.paths[toOpenApi(route.path)];
      expect(item, `${route.path} missing from openapi.json`).toBeDefined();
      expect(item?.[route.method.toLowerCase()]).toBeDefined();
    }
  });

  test("the contract lists no routes that are not registered", async () => {
    createApp();
    const manifest = (await Bun.file(
      join(CONTRACT_DIR, "api-manifest.json"),
    ).json()) as Manifest;
    const registered = new Set(
      getRegistry().map((r) => `${r.method} ${r.path}`),
    );

    for (const route of manifest.routes) {
      expect(registered.has(route.id)).toBe(true);
    }
  });
});
