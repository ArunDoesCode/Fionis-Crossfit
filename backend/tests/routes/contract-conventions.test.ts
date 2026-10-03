import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { createApp } from "../../src/app";
import { getRegistry } from "../../src/lib/route-registry";
import {
  call,
  forgedToken,
  isValidationError,
  mintToken,
  OTHER_UNKNOWN_ID,
  UNKNOWN_ID,
} from "../helpers/http";

// Route-level conventions of the API contract (api-contract.md):
// BR-REC-153 formats, BR-REC-155 lists, BR-REC-156 Idempotency-Key header,
// BR-REC-157 update bodies, BR-REC-159 sign-in on every route.
// Handlers are placeholders in Stream 0 and real in later streams, so these
// tests look at what the contract fixes (auth, validation, headers) and treat
// "not a VALIDATION_ERROR" as "the request was accepted".

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** The 40 endpoints of the api-contract table (spec) + the health check. */
const ENDPOINTS: [string, Method, string][] = [
  ["E01", "POST", "/api/auth/login"],
  ["E02", "POST", "/api/auth/refresh"],
  ["E03", "POST", "/api/auth/logout"],
  ["E04", "POST", "/api/auth/logout-all"],
  ["E05", "GET", "/api/auth/me"],
  ["E06", "POST", "/api/auth/password"],
  ["E07", "GET", "/api/settings"],
  ["E08", "PATCH", "/api/settings"],
  ["E09", "GET", "/api/assessment-types"],
  ["E10", "POST", "/api/assessment-types"],
  ["E11", "PATCH", "/api/assessment-types/:typeId"],
  ["E12", "PUT", "/api/assessment-types/order"],
  ["E13", "POST", "/api/assessment-types/:typeId/metrics"],
  ["E14", "PATCH", "/api/metrics/:metricId"],
  ["E15", "PUT", "/api/assessment-types/:typeId/metric-order"],
  ["E16", "GET", "/api/members"],
  ["E17", "POST", "/api/members"],
  ["E18", "GET", "/api/members/:memberId"],
  ["E19", "PATCH", "/api/members/:memberId"],
  ["E20", "POST", "/api/members/:memberId/archive"],
  ["E21", "POST", "/api/members/:memberId/restore"],
  ["E22", "POST", "/api/members/:memberId/periods"],
  ["E23", "PATCH", "/api/members/:memberId/periods/:periodId"],
  ["E24", "GET", "/api/memberships/ending"],
  ["E25", "GET", "/api/members/:memberId/entry-form"],
  ["E26", "POST", "/api/assessments"],
  ["E27", "GET", "/api/assessments"],
  ["E28", "GET", "/api/assessments/:assessmentId"],
  ["E29", "PATCH", "/api/assessments/:assessmentId"],
  ["E30", "DELETE", "/api/assessments/:assessmentId"],
  ["E31", "GET", "/api/due"],
  ["E32", "GET", "/api/members/:memberId/due"],
  ["E33", "PUT", "/api/members/:memberId/due-actions/:typeId"],
  ["E34", "DELETE", "/api/members/:memberId/due-actions/:typeId"],
  ["E35", "GET", "/api/members/:memberId/report-card"],
  ["E36", "GET", "/api/reports/progress"],
  ["E37", "GET", "/api/reports/leaderboard"],
  ["E38", "GET", "/api/reports/active-by-plan"],
  ["E39", "GET", "/api/exports/:file"],
  ["E40", "POST", "/api/vitals"],
];
const PUBLIC_IDS = new Set(["E01", "E02", "E03"]);

/** Replaces every `:param` of a route path with a well-formed value. */
function concrete(path: string): string {
  return path
    .replace(":file", "members.csv")
    .replace(/:[A-Za-z0-9_]+/g, UNKNOWN_ID);
}

type OpenApi = {
  paths: Record<
    string,
    Record<
      string,
      {
        parameters?: {
          name: string;
          in: string;
          schema?: Record<string, unknown>;
        }[];
        responses?: Record<string, unknown>;
      }
    >
  >;
};

async function openapi(): Promise<OpenApi> {
  return (await Bun.file(
    join(import.meta.dir, "../../.contracts/openapi.json"),
  ).json()) as OpenApi;
}

const toOpenApiPath = (p: string) => p.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

// ─── BR-REC-159: sign-in on every route except E01-E03 and health ──────────

describe("BR-REC-159 every route needs a sign-in except E01-E03 and health", () => {
  test("BR-REC-159 all 40 endpoints of the contract table and the health check are registered, and nothing else", () => {
    createApp();
    const registered = getRegistry().map((r) => `${r.method} ${r.path}`);
    const expected = [
      ...ENDPOINTS.map(([, method, path]) => `${method} ${path}`),
      "GET /api/health",
    ];
    expect(registered.sort()).toEqual(expected.sort());
  });

  test("BR-REC-159 every endpoint of the table is in the generated openapi.json", async () => {
    const doc = await openapi();
    const missing = ENDPOINTS.filter(
      ([, method, path]) =>
        !doc.paths[toOpenApiPath(path)]?.[method.toLowerCase()],
    ).map(([id]) => id);
    expect(missing).toEqual([]);
  });

  test("BR-REC-159 descriptors: E01-E03 and health are public, every other route is any-authenticated", () => {
    createApp();
    const publicKeys = new Set([
      "GET /api/health",
      ...ENDPOINTS.filter(([id]) => PUBLIC_IDS.has(id)).map(
        ([, method, path]) => `${method} ${path}`,
      ),
    ]);
    const wrong = getRegistry()
      .filter((r) => {
        const key = `${r.method} ${r.path}`;
        return (
          r.auth.type !== (publicKeys.has(key) ? "public" : "any-authenticated")
        );
      })
      .map((r) => `${r.method} ${r.path}: ${r.auth.type}`);
    expect(wrong).toEqual([]);
  });

  test("BR-REC-159 no cookie: every protected route answers 401 UNAUTHORIZED (before validation)", async () => {
    const app = createApp();
    const wrong: string[] = [];
    for (const [id, method, path] of ENDPOINTS) {
      if (PUBLIC_IDS.has(id)) continue;
      const reply = await call(app, method, concrete(path), {
        token: null,
        body: method === "GET" ? undefined : {},
      });
      if (reply.status !== 401 || reply.body?.code !== "UNAUTHORIZED") {
        wrong.push(
          `${id} ${method} ${path} -> ${reply.status} ${reply.body?.code}`,
        );
      }
    }
    expect(wrong).toEqual([]);
  });

  test("BR-REC-159 a token signed with the wrong secret is 401 on every protected route", async () => {
    const app = createApp();
    const token = await forgedToken();
    const wrong: string[] = [];
    for (const [id, method, path] of ENDPOINTS) {
      if (PUBLIC_IDS.has(id)) continue;
      const reply = await call(app, method, concrete(path), {
        token,
        body: method === "GET" ? undefined : {},
      });
      if (reply.status !== 401) wrong.push(`${id} -> ${reply.status}`);
    }
    expect(wrong).toEqual([]);
  });

  test("BR-REC-159 a garbage token is 401", async () => {
    const reply = await call(createApp(), "GET", "/api/members", {
      token: "not-a-token",
    });
    expect(reply.status).toBe(401);
    expect(reply.body?.code).toBe("UNAUTHORIZED");
  });

  test("BR-REC-159 a signed-in request (access_token cookie) passes the sign-in check on every protected route", async () => {
    const app = createApp();
    const token = await mintToken();
    const wrong: string[] = [];
    for (const [id, method, path] of ENDPOINTS) {
      if (PUBLIC_IDS.has(id)) continue;
      const reply = await call(app, method, concrete(path), {
        token,
        body: method === "GET" ? undefined : {},
      });
      if (reply.status === 401) wrong.push(`${id} ${method} ${path}`);
    }
    expect(wrong).toEqual([]);
  });

  test("BR-REC-159 a bearer token is accepted as well as the cookie", async () => {
    const app = createApp();
    const token = await mintToken();
    const reply = await call(app, "GET", "/api/members", {
      token: null,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(reply.status).not.toBe(401);
  });

  test("BR-REC-159 the health check needs no sign-in", async () => {
    const reply = await call(createApp(), "GET", "/api/health", {
      token: null,
    });
    expect(reply.status).toBe(200);
  });

  for (const [id, method, path] of ENDPOINTS.filter(([i]) =>
    PUBLIC_IDS.has(i),
  )) {
    test(`BR-REC-159 ${id} ${method} ${path} is reachable without a sign-in (never 401 UNAUTHORIZED)`, async () => {
      const reply = await call(createApp(), method, path, {
        token: null,
        body: {},
      });
      expect(reply.body?.code).not.toBe("UNAUTHORIZED");
      expect(reply.status).not.toBe(404);
    });
  }
});

// ─── BR-REC-155: lists ──────────────────────────────────────────────────────

const LISTS: { id: string; path: string; query: string }[] = [
  { id: "E09", path: "/api/assessment-types", query: "" },
  { id: "E16", path: "/api/members", query: "" },
  { id: "E24", path: "/api/memberships/ending", query: "status=expiring" },
  { id: "E27", path: "/api/assessments", query: `memberId=${UNKNOWN_ID}` },
  { id: "E31", path: "/api/due", query: "status=overdue" },
  {
    id: "E37",
    path: "/api/reports/leaderboard",
    query: `metricId=${UNKNOWN_ID}&sex=male`,
  },
];

const listUrl = (list: (typeof LISTS)[number], extra: string) =>
  `${list.path}?${[list.query, extra].filter(Boolean).join("&")}`;

describe("BR-REC-155 lists use page, pageSize (default 10, max 100) and whitelisted sorting", () => {
  for (const list of LISTS) {
    test(`BR-REC-155 ${list.id} pageSize=500 is 400 VALIDATION_ERROR`, async () => {
      const reply = await call(
        createApp(),
        "GET",
        listUrl(list, "pageSize=500"),
      );
      expect(reply.status).toBe(400);
      expect(reply.body).toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      });
    });

    test(`BR-REC-155 ${list.id} refuses pageSize 101 and 0, page 0 and -1, and non-numbers`, async () => {
      const app = createApp();
      const accepted: string[] = [];
      for (const extra of [
        "pageSize=101",
        "pageSize=0",
        "pageSize=-5",
        "page=0",
        "page=-1",
        "page=abc",
        "pageSize=abc",
        "page=1.5",
      ]) {
        const reply = await call(app, "GET", listUrl(list, extra));
        if (!isValidationError(reply)) accepted.push(extra);
      }
      expect(accepted).toEqual([]);
    });

    test(`BR-REC-155 ${list.id} accepts page 1, pageSize 100 and 25, and no paging at all (defaults)`, async () => {
      const app = createApp();
      const refused: string[] = [];
      for (const extra of [
        "",
        "page=1",
        "pageSize=100",
        "page=2&pageSize=25",
        "pageSize=1",
      ]) {
        const reply = await call(app, "GET", listUrl(list, extra));
        if (isValidationError(reply)) refused.push(extra || "(none)");
      }
      expect(refused).toEqual([]);
    });
  }

  test("BR-REC-155 every list in the generated contract has page (from 1, default 1) and pageSize (default 10, max 100) and answers with meta { page, pageSize, total, totalPages }", async () => {
    const doc = await openapi();
    const problems: string[] = [];
    for (const list of LISTS) {
      const op = doc.paths[list.path]?.get;
      const page = op?.parameters?.find((p) => p.name === "page");
      const pageSize = op?.parameters?.find((p) => p.name === "pageSize");
      if (page?.schema?.minimum !== 1 || page?.schema?.default !== 1) {
        problems.push(`${list.id} page`);
      }
      if (
        pageSize?.schema?.maximum !== 100 ||
        pageSize?.schema?.default !== 10 ||
        pageSize?.schema?.minimum !== 1
      ) {
        problems.push(`${list.id} pageSize`);
      }
      const ok = op?.responses?.["200"] as
        | {
            content?: {
              "application/json"?: {
                schema?: {
                  properties?: Record<
                    string,
                    { properties?: Record<string, unknown> }
                  >;
                };
              };
            };
          }
        | undefined;
      const meta =
        ok?.content?.["application/json"]?.schema?.properties?.meta?.properties;
      for (const key of ["page", "pageSize", "total", "totalPages"]) {
        if (!meta || !(key in meta)) problems.push(`${list.id} meta.${key}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("BR-REC-155 E16 sorts only by whitelisted fields: name, joinedOn, lastAssessedOn", async () => {
    const app = createApp();
    for (const sortBy of ["name", "joinedOn", "lastAssessedOn"]) {
      const ok = await call(app, "GET", `/api/members?sortBy=${sortBy}`);
      expect(isValidationError(ok)).toBe(false);
    }
    for (const sortBy of [
      "password",
      "phone",
      "id",
      "created_at",
      "name;drop",
    ]) {
      const bad = await call(
        app,
        "GET",
        `/api/members?sortBy=${encodeURIComponent(sortBy)}`,
      );
      expect(isValidationError(bad)).toBe(true);
    }
    const dir = await call(app, "GET", "/api/members?sortDir=sideways");
    expect(isValidationError(dir)).toBe(true);
  });

  test("api-contract E27 sorts newest first by default (sortDir default desc), E16 A-Z (asc)", async () => {
    const doc = await openapi();
    const dirOf = (path: string) =>
      doc.paths[path]?.get?.parameters?.find((p) => p.name === "sortDir")
        ?.schema?.default;
    expect(dirOf("/api/assessments")).toBe("desc");
    expect(dirOf("/api/members")).toBe("asc");
  });
});

// ─── BR-REC-157: update bodies ──────────────────────────────────────────────

describe("BR-REC-157 update bodies reject unknown fields and need at least one field", () => {
  const UPDATES: {
    id: string;
    path: string;
    valid: Record<string, unknown> | null;
    unknown: Record<string, unknown>;
  }[] = [
    // E08 has no accepted-value control: a valid change would write the one settings row.
    {
      id: "E08",
      path: "/api/settings",
      valid: null,
      unknown: { gymName: "Fionis CrossFit", nickname: "x" },
    },
    {
      id: "E11",
      path: `/api/assessment-types/${UNKNOWN_ID}`,
      valid: { isActive: true },
      unknown: { isActive: true, sortOrder: 3 },
    },
    {
      id: "E14",
      path: `/api/metrics/${UNKNOWN_ID}`,
      valid: { isActive: true },
      unknown: { isActive: true, typeId: OTHER_UNKNOWN_ID },
    },
    {
      id: "E19",
      path: `/api/members/${UNKNOWN_ID}`,
      valid: { notes: "TEST_foundation note" },
      unknown: { notes: "x", archivedAt: "2026-01-01T00:00:00.000Z" },
    },
    {
      id: "E23",
      path: `/api/members/${UNKNOWN_ID}/periods/${OTHER_UNKNOWN_ID}`,
      valid: { plan: "annual" },
      unknown: { plan: "annual", endOn: "2027-12-31" },
    },
    {
      id: "E29",
      path: `/api/assessments/${UNKNOWN_ID}`,
      valid: { isEstimated: true },
      unknown: { isEstimated: true, memberId: OTHER_UNKNOWN_ID },
    },
  ];

  for (const u of UPDATES) {
    test(`BR-REC-157 ${u.id} an empty body {} is 400 VALIDATION_ERROR`, async () => {
      const reply = await call(createApp(), "PATCH", u.path, { body: {} });
      expect(reply.status).toBe(400);
      expect(reply.body).toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      });
    });

    test(`BR-REC-157 ${u.id} an unknown field is 400 VALIDATION_ERROR, even next to a valid one`, async () => {
      const reply = await call(createApp(), "PATCH", u.path, {
        body: u.unknown,
      });
      expect(reply.status).toBe(400);
      expect(reply.body).toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      });
    });

    test(`BR-REC-157 ${u.id} a body made only of an unknown field is 400 VALIDATION_ERROR`, async () => {
      const reply = await call(createApp(), "PATCH", u.path, {
        body: { bogus: 1 },
      });
      expect(isValidationError(reply)).toBe(true);
    });

    if (u.valid) {
      test(`BR-REC-157 ${u.id} one valid field is accepted (not a validation error)`, async () => {
        const reply = await call(createApp(), "PATCH", u.path, {
          body: u.valid,
        });
        expect(isValidationError(reply)).toBe(false);
      });
    }
  }

  test("BR-REC-157 E19 a nullable field can be cleared with null", async () => {
    const reply = await call(
      createApp(),
      "PATCH",
      `/api/members/${UNKNOWN_ID}`,
      {
        body: { notes: null },
      },
    );
    expect(isValidationError(reply)).toBe(false);
  });

  test("BR-REC-157 PATCH /members/1 {} is 400 (the id is malformed too)", async () => {
    const reply = await call(createApp(), "PATCH", "/api/members/1", {
      body: {},
    });
    expect(reply.status).toBe(400);
  });
});

// ─── BR-REC-156: the Idempotency-Key header on E17 and E22 ──────────────────

describe("BR-REC-156 creates E17 and E22 need an Idempotency-Key (UUID)", () => {
  const e17 = {
    fullName: "TEST_foundation Member",
    phone: "9845012345",
    dateOfBirth: "1982-05-10",
    sex: "male",
    joinedOn: "2025-06-01",
    firstPeriod: { plan: "annual", startOn: "2025-06-01" },
  };
  const e22 = { plan: "annual", startOn: "2026-10-03" };

  test("BR-REC-156 E17 without the header is 400 IDEMPOTENCY_KEY_MISSING", async () => {
    const reply = await call(createApp(), "POST", "/api/members", {
      body: e17,
    });
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      success: false,
      code: "IDEMPOTENCY_KEY_MISSING",
    });
  });

  test("BR-REC-156 E22 without the header is 400 IDEMPOTENCY_KEY_MISSING", async () => {
    const reply = await call(
      createApp(),
      "POST",
      `/api/members/${UNKNOWN_ID}/periods`,
      {
        body: e22,
      },
    );
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      success: false,
      code: "IDEMPOTENCY_KEY_MISSING",
    });
  });

  test("BR-REC-156 a key that is not a UUID is 400 IDEMPOTENCY_KEY_MISSING on E17 and E22", async () => {
    const headers = { "Idempotency-Key": "not-a-uuid" };
    const a = await call(createApp(), "POST", "/api/members", {
      body: e17,
      headers,
    });
    expect(a.body?.code).toBe("IDEMPOTENCY_KEY_MISSING");
    const b = await call(
      createApp(),
      "POST",
      `/api/members/${UNKNOWN_ID}/periods`,
      {
        body: e22,
        headers,
      },
    );
    expect(b.body?.code).toBe("IDEMPOTENCY_KEY_MISSING");
  });

  test("BR-REC-156 a bad body is a VALIDATION_ERROR first, whether or not the header is there", async () => {
    const reply = await call(createApp(), "POST", "/api/members", {
      body: { fullName: "only a name" },
    });
    expect(isValidationError(reply)).toBe(true);
  });

  test("BR-REC-156 the other creates (E13, E26) do not ask for the header", async () => {
    const app = createApp();
    const a = await call(
      app,
      "POST",
      `/api/assessment-types/${UNKNOWN_ID}/metrics`,
      {
        body: {
          name: "TEST_foundation metric",
          datatype: "number",
          better: "higher",
        },
      },
    );
    const b = await call(app, "POST", "/api/assessments", { body: {} });
    for (const reply of [a, b]) {
      expect(reply.body?.code).not.toBe("IDEMPOTENCY_KEY_MISSING");
    }
  });

  test("BR-REC-156 the generated contract documents the Idempotency-Key on E17 and E22", async () => {
    const doc = await openapi();
    for (const [path, method] of [
      ["/api/members", "post"],
      ["/api/members/{memberId}/periods", "post"],
    ] as const) {
      const op = doc.paths[path]?.[method] as
        | { description?: string }
        | undefined;
      expect(`${op?.description ?? ""}`).toMatch(/Idempotency-Key/);
    }
  });
});

// ─── BR-REC-153: formats ────────────────────────────────────────────────────

describe("BR-REC-153 JSON in camelCase, days as YYYY-MM-DD, moments as ISO UTC", () => {
  type Schema = Record<string, unknown>;

  function propertyEntries(
    node: unknown,
    out: [string, Schema][] = [],
  ): [string, Schema][] {
    if (Array.isArray(node)) {
      for (const item of node) propertyEntries(item, out);
    } else if (node && typeof node === "object") {
      const obj = node as Schema;
      const props = obj.properties;
      if (props && typeof props === "object" && !Array.isArray(props)) {
        for (const [key, value] of Object.entries(props as Schema)) {
          out.push([key, value as Schema]);
        }
      }
      for (const value of Object.values(obj)) propertyEntries(value, out);
    }
    return out;
  }

  const leaves = (schema: Schema): Schema[] => {
    const parts = (schema.anyOf ?? schema.oneOf) as Schema[] | undefined;
    const list = parts ?? [schema];
    return list.filter((s) => s.type !== "null");
  };

  test("BR-REC-153 every property and query parameter name in the contract is camelCase", async () => {
    const doc = await openapi();
    const names = new Set<string>(propertyEntries(doc).map(([k]) => k));
    for (const path of Object.values(doc.paths)) {
      for (const op of Object.values(path)) {
        for (const p of op.parameters ?? []) names.add(p.name);
      }
    }
    const bad = [...names].filter((n) => !/^[a-z][a-zA-Z0-9]*$/.test(n));
    expect(bad).toEqual([]);
  });

  test("BR-REC-153 every calendar-day field in the contract is a YYYY-MM-DD string, never a date-time", async () => {
    const doc = await openapi();
    const isDay = (name: string) =>
      /On$/.test(name) ||
      ["on", "date", "until", "dateOfBirth", "snoozedUntil"].includes(name);
    const problems: string[] = [];
    for (const [name, schema] of propertyEntries(doc)) {
      if (!isDay(name)) continue;
      for (const leaf of leaves(schema)) {
        const pattern = String(leaf.pattern ?? "");
        if (
          leaf.type !== "string" ||
          leaf.format === "date-time" ||
          !pattern.includes("\\d{4}-\\d{2}-\\d{2}")
        ) {
          problems.push(`${name}: ${JSON.stringify(leaf).slice(0, 80)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test("BR-REC-153 every moment field (…At) in the contract is an ISO date-time string", async () => {
    const doc = await openapi();
    const problems: string[] = [];
    let seen = 0;
    for (const [name, schema] of propertyEntries(doc)) {
      if (!/At$/.test(name)) continue;
      seen++;
      for (const leaf of leaves(schema)) {
        if (leaf.type !== "string" || leaf.format !== "date-time") {
          problems.push(`${name}: ${JSON.stringify(leaf).slice(0, 80)}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });

  const e26 = (over: Record<string, unknown> = {}) => ({
    memberId: UNKNOWN_ID,
    typeId: OTHER_UNKNOWN_ID,
    date: "2025-12-30",
    isEstimated: false,
    values: [{ metricId: UNKNOWN_ID, value: 122 }],
    ...over,
  });

  test("BR-REC-153 E26 accepts a date written YYYY-MM-DD", async () => {
    const reply = await call(createApp(), "POST", "/api/assessments", {
      body: e26(),
    });
    expect(isValidationError(reply)).toBe(false);
  });

  for (const date of [
    "2026-02-30",
    "2026-13-01",
    "2025-2-3",
    "30-12-2025",
    "12/30/2025",
    "2025-12-30T08:00:00Z",
    "20251230",
    "",
    "yesterday",
  ]) {
    test(`BR-REC-153 E26 refuses the date ${JSON.stringify(date)} with 400 VALIDATION_ERROR on date`, async () => {
      const reply = await call(createApp(), "POST", "/api/assessments", {
        body: e26({ date }),
      });
      expect(isValidationError(reply)).toBe(true);
      const issues = (reply.body?.details?.issues ?? []) as { path: string }[];
      expect(issues.some((i) => String(i.path).includes("date"))).toBe(true);
    });
  }

  test("BR-REC-153 E26 refuses a date sent as a number", async () => {
    const reply = await call(createApp(), "POST", "/api/assessments", {
      body: e26({ date: 1767052800000 }),
    });
    expect(isValidationError(reply)).toBe(true);
  });

  test("BR-REC-153 a member's date of birth and join date must be real days too (E19)", async () => {
    const app = createApp();
    for (const body of [
      { dateOfBirth: "1982-02-30" },
      { joinedOn: "2025-6-1" },
    ]) {
      const reply = await call(app, "PATCH", `/api/members/${UNKNOWN_ID}`, {
        body,
      });
      expect(isValidationError(reply)).toBe(true);
    }
    const ok = await call(app, "PATCH", `/api/members/${UNKNOWN_ID}`, {
      body: { dateOfBirth: "1982-05-10" },
    });
    expect(isValidationError(ok)).toBe(false);
  });

  test("BR-REC-153 months in reports are YYYY-MM (E36 joinedFrom / joinedTo)", async () => {
    const app = createApp();
    for (const joinedFrom of [
      "2026-13",
      "2026-00",
      "2026-1",
      "2026-10-03",
      "oct-2026",
    ]) {
      const reply = await call(
        app,
        "GET",
        `/api/reports/progress?metricId=${UNKNOWN_ID}&joinedFrom=${joinedFrom}`,
      );
      expect(isValidationError(reply)).toBe(true);
    }
    const ok = await call(
      app,
      "GET",
      `/api/reports/progress?metricId=${UNKNOWN_ID}&joinedFrom=2026-01&joinedTo=2026-10`,
    );
    expect(isValidationError(ok)).toBe(false);
  });

  test("BR-REC-153 a durations value is sent as plain seconds: E26 takes 122 for Plank 2:02", async () => {
    const reply = await call(createApp(), "POST", "/api/assessments", {
      body: e26({ values: [{ metricId: UNKNOWN_ID, value: 122 }] }),
    });
    expect(isValidationError(reply)).toBe(false);
  });

  test("BR-REC-153 a time written 2:02 instead of seconds is refused", async () => {
    const reply = await call(createApp(), "POST", "/api/assessments", {
      body: e26({ values: [{ metricId: UNKNOWN_ID, value: "2:02" }] }),
    });
    expect(isValidationError(reply)).toBe(true);
  });
});

// ─── Contract shapes the stream owners rely on (api-contract.md) ────────────

describe("api-contract request shapes", () => {
  test("api-contract E26 takes at most 60 values; empty or all-null is not a shape error (NO_VALUES is a service answer)", async () => {
    const app = createApp();
    const body = (values: unknown[]) => ({
      memberId: UNKNOWN_ID,
      typeId: OTHER_UNKNOWN_ID,
      date: "2025-12-30",
      isEstimated: false,
      values,
    });
    const value = (i: number) => ({ metricId: crypto.randomUUID(), value: i });
    const sixty = Array.from({ length: 60 }, (_, i) => value(i));
    const sixtyOne = Array.from({ length: 61 }, (_, i) => value(i));

    expect(
      isValidationError(
        await call(app, "POST", "/api/assessments", { body: body(sixtyOne) }),
      ),
    ).toBe(true);
    expect(
      isValidationError(
        await call(app, "POST", "/api/assessments", { body: body(sixty) }),
      ),
    ).toBe(false);
    expect(
      isValidationError(
        await call(app, "POST", "/api/assessments", { body: body([]) }),
      ),
    ).toBe(false);
    expect(
      isValidationError(
        await call(app, "POST", "/api/assessments", {
          body: body([{ metricId: UNKNOWN_ID, value: null }]),
        }),
      ),
    ).toBe(false);
  });

  test("api-contract required query values: E24 status, E27 memberId, E31 status, E36 metricId, E37 metricId and sex", async () => {
    const app = createApp();
    for (const url of [
      "/api/memberships/ending",
      "/api/assessments",
      "/api/due",
      "/api/reports/progress",
      "/api/reports/leaderboard",
      `/api/reports/leaderboard?metricId=${UNKNOWN_ID}`,
      `/api/reports/leaderboard?sex=male`,
    ]) {
      const reply = await call(app, "GET", url);
      expect(isValidationError(reply), url).toBe(true);
    }
  });

  test("api-contract query values come from the contract's lists: E24 status, E31 status, E16 status, E36 ageBand", async () => {
    const app = createApp();
    for (const url of [
      "/api/memberships/ending?status=any",
      "/api/due?status=done",
      "/api/members?status=weird",
      `/api/reports/progress?metricId=${UNKNOWN_ID}&ageBand=teen`,
    ]) {
      expect(isValidationError(await call(app, "GET", url)), url).toBe(true);
    }
    for (const url of [
      "/api/memberships/ending?status=expiring",
      "/api/memberships/ending?status=expired",
      "/api/due?status=overdue",
      "/api/due?status=upcoming",
      ...["active", "expiring", "expired", "archived", "any"].map(
        (s) => `/api/members?status=${s}`,
      ),
      ...["under20", "20to29", "30to39", "40to49", "50to59", "60plus"].map(
        (b) => `/api/reports/progress?metricId=${UNKNOWN_ID}&ageBand=${b}`,
      ),
    ]) {
      expect(isValidationError(await call(app, "GET", url)), url).toBe(false);
    }
  });

  test("api-contract malformed ids are 400 VALIDATION_ERROR, a well-formed unknown id is not", async () => {
    const app = createApp();
    expect(
      isValidationError(await call(app, "GET", "/api/members/not-an-id")),
    ).toBe(true);
    expect(
      isValidationError(await call(app, "GET", `/api/members/${UNKNOWN_ID}`)),
    ).toBe(false);
  });

  test("api-contract unparsable JSON is 400 INVALID_JSON", async () => {
    const reply = await call(createApp(), "POST", "/api/assessments", {
      rawBody: "{not json",
    });
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe("INVALID_JSON");
  });

  test("api-contract a Zod failure carries details.issues[{ path, message }]", async () => {
    const reply = await call(createApp(), "GET", "/api/members?pageSize=500");
    const issues = (reply.body?.details?.issues ?? []) as {
      path: string;
      message: string;
    }[];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({
      path: expect.stringContaining("pageSize"),
      message: expect.any(String),
    });
  });

  test("api-contract E39 export file names come from the list members.csv, memberships.csv, measurements.csv", async () => {
    const app = createApp();
    for (const file of ["members.csv", "memberships.csv", "measurements.csv"]) {
      const reply = await call(app, "GET", `/api/exports/${file}`);
      expect(isValidationError(reply), file).toBe(false);
    }
  });
});
