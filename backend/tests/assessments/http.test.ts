import { beforeAll, describe, expect, test } from "bun:test";

import { call, forgedToken } from "../helpers/http";
import {
  expectError,
  type SaveResult,
  type SeededMember,
  type SeededType,
  useAssessmentsSuite,
} from "./support/suite";

// The HTTP surface shared by E25-E30: sign-in (BR-REC-159), the Origin check on writes (BR-REC-37),
// response headers (BR-REC-161), the error envelope (BR-REC-154).

const s = useAssessmentsSuite();

const FOREIGN_ORIGIN = "https://evil.example";

let body: SeededType;
let member: SeededMember;
let assessmentId: string;

beforeAll(async () => {
  body = await s.seedType();
  member = await s.seedMember();
  assessmentId = (
    await s.seedAssessment({
      member,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    })
  ).id;
});

function saveBody(date = "2025-12-30") {
  return {
    memberId: member.id,
    typeId: body.id,
    date,
    isEstimated: false,
    values: [{ metricId: body.metric("Weight").id, value: 94 }],
  };
}

describe("sign-in is needed on all six endpoints (BR-REC-159)", () => {
  test("BR-REC-159 E25 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await s.get(
      `/api/members/${member.id}/entry-form`,
      { typeId: body.id, date: "2025-12-30" },
      null,
    );
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("BR-REC-159 E26 without a sign-in is 401 UNAUTHORIZED and nothing is saved", async () => {
    const reply = await s.send("POST", "/api/assessments", {
      body: saveBody("2025-12-31"),
      token: null,
    });
    expectError(reply, 401, "UNAUTHORIZED");
    const rows = await s.assessmentRows(member.id, body.id);
    expect(rows.map((r) => r.assessedOn)).toEqual(["2025-03-12"]);
  });

  test("BR-REC-159 E27 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await s.get(
      "/api/assessments",
      { memberId: member.id },
      null,
    );
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("BR-REC-159 E28 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await s.get(
      `/api/assessments/${assessmentId}`,
      undefined,
      null,
    );
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("BR-REC-159 E29 without a sign-in is 401 UNAUTHORIZED and nothing moves", async () => {
    const reply = await s.send("PATCH", `/api/assessments/${assessmentId}`, {
      body: { date: "2025-03-20" },
      token: null,
    });
    expectError(reply, 401, "UNAUTHORIZED");
    expect((await s.assessmentRow(assessmentId))?.assessedOn).toBe(
      "2025-03-12",
    );
  });

  test("BR-REC-159 E30 without a sign-in is 401 UNAUTHORIZED and nothing is deleted", async () => {
    const reply = await s.send("DELETE", `/api/assessments/${assessmentId}`, {
      token: null,
    });
    expectError(reply, 401, "UNAUTHORIZED");
    expect(await s.assessmentRow(assessmentId)).toBeDefined();
  });

  test("BR-REC-159 a token signed with the wrong secret is not accepted", async () => {
    const token = await forgedToken();
    const reply = await s.get(
      "/api/assessments",
      { memberId: member.id },
      token,
    );
    expectError(reply, 401, "UNAUTHORIZED");
    const write = await s.send("POST", "/api/assessments", {
      body: saveBody("2025-12-31"),
      token,
    });
    expectError(write, 401, "UNAUTHORIZED");
  });
});

describe("a write from another site is refused (BR-REC-37)", () => {
  test("BR-REC-37 E26 with a foreign Origin is 403 CSRF_ORIGIN and nothing is saved", async () => {
    const reply = await s.send("POST", "/api/assessments", {
      body: saveBody("2025-12-31"),
      origin: FOREIGN_ORIGIN,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect((await s.assessmentRows(member.id, body.id)).length).toBe(1);
  });

  test("BR-REC-37 E26 with no Origin header is 403 CSRF_ORIGIN", async () => {
    const reply = await s.send("POST", "/api/assessments", {
      body: saveBody("2025-12-31"),
      origin: null,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("BR-REC-37 E29 with a foreign Origin is 403 CSRF_ORIGIN and nothing moves", async () => {
    const reply = await s.send("PATCH", `/api/assessments/${assessmentId}`, {
      body: { date: "2025-03-20" },
      origin: FOREIGN_ORIGIN,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect((await s.assessmentRow(assessmentId))?.assessedOn).toBe(
      "2025-03-12",
    );
  });

  test("BR-REC-37 E29 with no Origin header is 403 CSRF_ORIGIN", async () => {
    const reply = await s.send("PATCH", `/api/assessments/${assessmentId}`, {
      body: { date: "2025-03-20" },
      origin: null,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("BR-REC-37 E30 with a foreign Origin is 403 CSRF_ORIGIN and nothing is deleted", async () => {
    const reply = await s.send("DELETE", `/api/assessments/${assessmentId}`, {
      origin: FOREIGN_ORIGIN,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect(await s.assessmentRow(assessmentId)).toBeDefined();
  });

  test("BR-REC-37 E30 with no Origin header is 403 CSRF_ORIGIN", async () => {
    const reply = await s.send("DELETE", `/api/assessments/${assessmentId}`, {
      origin: null,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
    expect(await s.assessmentRow(assessmentId)).toBeDefined();
  });

  test("BR-REC-37 the Origin is checked before the sign-in: a foreign write with no sign-in is 403, not 401", async () => {
    const reply = await s.send("POST", "/api/assessments", {
      body: saveBody("2025-12-31"),
      origin: FOREIGN_ORIGIN,
      token: null,
    });
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("BR-REC-37 reads are never refused for their Origin", async () => {
    const reply = await call(
      s.app,
      "GET",
      `/api/assessments?memberId=${member.id}`,
      { token: s.token, origin: FOREIGN_ORIGIN },
    );
    expect(reply.status).toBe(200);
  });
});

describe("response headers (BR-REC-161)", () => {
  function expectDataHeaders(reply: {
    headers: Headers;
    status: number;
  }): void {
    expect(reply.status).toBe(200);
    const cacheControl = reply.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
    const timing = reply.headers.get("server-timing") ?? "";
    expect(timing).toContain("db");
    expect(timing).toContain("total");
  }

  test("BR-REC-161 E25 is not cached and carries Server-Timing", async () => {
    expectDataHeaders(
      await s.entryForm(member.id, { typeId: body.id, date: "2025-03-12" }),
    );
  });

  test("BR-REC-161 E26 is not cached and carries Server-Timing", async () => {
    const reply = await s.save(saveBody("2025-12-30"));
    expectDataHeaders(reply);
    expect(
      (reply.body?.data as SaveResult | undefined)?.assessmentId,
    ).toBeDefined();
  });

  test("BR-REC-161 E27 is not cached and carries Server-Timing", async () => {
    expectDataHeaders(await s.list({ memberId: member.id }));
  });

  test("BR-REC-161 E28 is not cached and carries Server-Timing", async () => {
    expectDataHeaders(await s.detail(assessmentId));
  });

  test("BR-REC-161 E29 is not cached and carries Server-Timing", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expectDataHeaders(await s.patch(a.id, { isEstimated: true }));
  });

  test("BR-REC-161 E30 is not cached and carries Server-Timing", async () => {
    const m = await s.seedMember();
    const a = await s.seedAssessment({
      member: m,
      type: body,
      date: "2025-03-12",
      values: [[body.metric("Weight"), 95.5]],
    });
    expectDataHeaders(await s.remove(a.id));
  });
});

describe("the answer envelope (BR-REC-154)", () => {
  test("BR-REC-154 a success is { success: true, data } and a list adds meta", async () => {
    const detail = await s.detail(assessmentId);
    expect(detail.body?.success).toBe(true);
    expect(detail.body?.data).toBeDefined();
    const list = await s.list({ memberId: member.id });
    expect(list.body?.success).toBe(true);
    expect(Array.isArray(list.body?.data)).toBe(true);
    expect(Object.keys(list.body?.meta ?? {}).sort()).toEqual([
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
  });

  test("BR-REC-154 a refusal is { success: false, message, code } with a plain-text message", async () => {
    // a date this member has no assessment on: nothing filled in a new assessment is refused
    const reply = await s.save({ ...saveBody("2025-11-11"), values: [] });
    expect(reply.body?.success).toBe(false);
    expect(reply.body?.code).toBe("NO_VALUES");
    expect(typeof reply.body?.message).toBe("string");
    expect(String(reply.body?.message).length).toBeGreaterThan(0);
  });

  test("BR-REC-154 a shape refusal lists its issues as details.issues with path and message", async () => {
    const reply = await s.save({ ...saveBody(), date: "2026-02-30" });
    expect(reply.status).toBe(400);
    expect(reply.body?.code).toBe("VALIDATION_ERROR");
    const issues = (reply.body?.details as { issues?: unknown[] } | undefined)
      ?.issues;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues?.length).toBeGreaterThan(0);
    const first = issues?.[0] as { path?: unknown; message?: unknown };
    expect(first.path).toBeDefined();
    expect(typeof first.message).toBe("string");
  });
});
