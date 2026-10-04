import { describe, expect, test } from "bun:test";

import {
  call,
  forgedToken,
  OTHER_UNKNOWN_ID,
  UNKNOWN_ID,
} from "../helpers/http";
import {
  dataOf,
  expectError,
  expectInvalid,
  type Meta,
  metaOf,
  PATH,
  useDueSuite,
} from "./support";

// The HTTP edge of E31-E34 (BR-REC-153..159, contract.md "All four endpoints" and "Request limits"):
// sign-in, the Origin check on writes, and what each request may look like. One error at a time.

const s = useDueSuite();

describe("sign-in (BR-REC-159: the shared login, no permission keys)", () => {
  test("E31 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await s.list({ status: "overdue" }, null);
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("E32 without a sign-in is 401 UNAUTHORIZED", async () => {
    expectError(await s.memberDue(UNKNOWN_ID, null), 401, "UNAUTHORIZED");
  });

  test("E33 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await call(
      s.app,
      "PUT",
      PATH.action(UNKNOWN_ID, OTHER_UNKNOWN_ID),
      { token: null, body: { action: "flag" } },
    );
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("E34 without a sign-in is 401 UNAUTHORIZED", async () => {
    const reply = await call(
      s.app,
      "DELETE",
      PATH.action(UNKNOWN_ID, OTHER_UNKNOWN_ID),
      { token: null },
    );
    expectError(reply, 401, "UNAUTHORIZED");
  });

  test("a token signed with another secret is refused on all four", async () => {
    const token = await forgedToken();
    expectError(
      await s.list({ status: "overdue" }, token),
      401,
      "UNAUTHORIZED",
    );
    expectError(await s.memberDue(UNKNOWN_ID, token), 401, "UNAUTHORIZED");
    expectError(
      await call(s.app, "PUT", PATH.action(UNKNOWN_ID, UNKNOWN_ID), {
        token,
        body: { action: "flag" },
      }),
      401,
      "UNAUTHORIZED",
    );
    expectError(
      await call(s.app, "DELETE", PATH.action(UNKNOWN_ID, UNKNOWN_ID), {
        token,
      }),
      401,
      "UNAUTHORIZED",
    );
  });

  test("a signed-in session with no permission keys may use all four (the shared login)", async () => {
    // the default session of this suite carries `permissions: []`
    expect((await s.list({ status: "overdue" })).status).toBe(200);
    expect((await s.memberDue(UNKNOWN_ID)).status).toBe(404);
    expect((await s.flag(UNKNOWN_ID, UNKNOWN_ID)).status).toBe(404);
    expect((await s.clearAction(UNKNOWN_ID, UNKNOWN_ID)).status).toBe(404);
  });
});

describe("Origin on writes (BR-REC-37; contract: Origin is checked before sign-in)", () => {
  test("E33 without an Origin header is 403 CSRF_ORIGIN", async () => {
    const reply = await s.setAction(
      UNKNOWN_ID,
      UNKNOWN_ID,
      { action: "flag" },
      {
        origin: null,
      },
    );
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("E33 from another origin is 403 CSRF_ORIGIN", async () => {
    const reply = await s.setAction(
      UNKNOWN_ID,
      UNKNOWN_ID,
      { action: "flag" },
      {
        origin: "https://evil.example",
      },
    );
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("E34 without an Origin header is 403 CSRF_ORIGIN", async () => {
    expectError(
      await s.clearAction(UNKNOWN_ID, UNKNOWN_ID, { origin: null }),
      403,
      "CSRF_ORIGIN",
    );
  });

  test("E34 from another origin is 403 CSRF_ORIGIN", async () => {
    expectError(
      await s.clearAction(UNKNOWN_ID, UNKNOWN_ID, {
        origin: "https://evil.example",
      }),
      403,
      "CSRF_ORIGIN",
    );
  });

  test("a write that is both unsigned and without Origin gets the Origin answer first (403)", async () => {
    const reply = await call(
      s.app,
      "PUT",
      PATH.action(UNKNOWN_ID, UNKNOWN_ID),
      {
        token: null,
        origin: null,
        body: { action: "flag" },
      },
    );
    expectError(reply, 403, "CSRF_ORIGIN");
  });

  test("a refused Origin leaves no override and no change-log row", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const member = await s.makeMember();
    const actor = await s.newActor();
    const reply = await s.setAction(
      member.id,
      type.id,
      { action: "flag" },
      { token: actor.token, origin: "https://evil.example" },
    );
    expect(reply.status).toBe(403);
    expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
    expect(await s.audit(actor.sid)).toHaveLength(0);
  });

  test("the reads need no Origin header", async () => {
    expect((await s.list({ status: "upcoming" })).status).toBe(200);
  });
});

describe("BR-REC-154, 155 E31 query (contract: Request limits)", () => {
  test("status is required", async () => {
    expectInvalid(await s.list(), "status");
  });

  test("status other than overdue or upcoming is refused, also the page URL word 'soon'", async () => {
    for (const status of ["soon", "all", "", "OVERDUE", "due"]) {
      expectInvalid(await s.list({ status }), "status");
    }
  });

  test("status overdue and upcoming both answer 200 with the paging meta", async () => {
    for (const status of ["overdue", "upcoming"]) {
      const reply = await s.list({ status });
      expect(reply.status).toBe(200);
      expect(Array.isArray(reply.body?.data)).toBe(true);
      const meta = metaOf(reply);
      expect(Object.keys(meta).sort()).toEqual([
        "page",
        "pageSize",
        "total",
        "totalPages",
      ]);
    }
  });

  test("a malformed typeId is 400 on typeId", async () => {
    for (const typeId of ["abc", "123", "not-a-uuid", "0000"]) {
      expectInvalid(await s.list({ status: "overdue", typeId }), "typeId");
    }
  });

  test("a well-formed unknown typeId is 200 with an empty page and total 0", async () => {
    const reply = await s.list({ status: "overdue", typeId: UNKNOWN_ID });
    expect(dataOf<unknown[]>(reply)).toEqual([]);
    const meta = metaOf(reply);
    expect(meta.total).toBe(0);
    expect(meta.page).toBe(1);
  });

  test("a turned-off assessment as typeId is 200 with an empty page and total 0", async () => {
    const type = await s.makeWeeklyType(["Weight"], { isActive: false });
    const member = await s.makeMember({ joinedOn: s.day(-30) });
    await s.record(member.id, type.id, s.day(-100), [
      type.metrics[0]?.id ?? "",
    ]);
    const reply = await s.list({ status: "overdue", typeId: type.id });
    expect(dataOf<unknown[]>(reply)).toEqual([]);
    expect(metaOf(reply).total).toBe(0);
  });

  test("page and pageSize default to 1 and 10", async () => {
    const meta = metaOf(await s.list({ status: "overdue" }));
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(10);
  });

  test("pageSize is limited to 1..100 and page starts at 1", async () => {
    for (const query of [
      { pageSize: 101 },
      { pageSize: 0 },
      { pageSize: -5 },
      { page: 0 },
      { page: -1 },
    ]) {
      const reply = await s.list({ status: "overdue", ...query });
      expectInvalid(reply, Object.keys(query)[0]);
    }
  });

  test("page and pageSize must be whole numbers", async () => {
    expectInvalid(await s.list({ status: "overdue", page: "abc" }), "page");
    expectInvalid(
      await s.list({ status: "overdue", pageSize: "ten" }),
      "pageSize",
    );
    expectInvalid(await s.list({ status: "overdue", page: "1.5" }), "page");
  });

  test("pageSize 1 and 100 are allowed and echoed in meta", async () => {
    const one = metaOf(await s.list({ status: "overdue", pageSize: 1 }));
    const hundred: Meta = metaOf(
      await s.list({ status: "overdue", pageSize: 100 }),
    );
    expect(one.pageSize).toBe(1);
    expect(hundred.pageSize).toBe(100);
  });

  test("unknown query keys are ignored (the order is fixed: no sortBy, sortDir or search)", async () => {
    const type = await s.makeWeeklyType(["Weight"]);
    const a = await s.makeMember({ name: "alpha" });
    const b = await s.makeMember({ name: "bravo" });
    await s.setDueDates(a, type, { Weight: s.day(-2) });
    await s.setDueDates(b, type, { Weight: s.day(-9) });
    const plain = dataOf<{ memberId: string }[]>(
      await s.list({ status: "overdue", typeId: type.id }),
    );
    const noisy = dataOf<{ memberId: string }[]>(
      await s.list({
        status: "overdue",
        typeId: type.id,
        sortBy: "fullName",
        sortDir: "desc",
        q: "alpha",
        foo: "bar",
      }),
    );
    expect(noisy.map((r) => r.memberId)).toEqual(plain.map((r) => r.memberId));
    expect(plain.map((r) => r.memberId)).toEqual([b.id, a.id]);
  });
});

describe("BR-REC-154 E32 / E33 / E34 ids in the path", () => {
  test("E32 a malformed member id is 400 on memberId", async () => {
    expectInvalid(await s.memberDue("not-a-uuid"), "memberId");
  });

  test("E32 a well-formed unknown member is 404 NOT_FOUND", async () => {
    expectError(await s.memberDue(UNKNOWN_ID), 404, "NOT_FOUND");
  });

  test("E33 a malformed member id or assessment id is 400", async () => {
    expectInvalid(
      await s.setAction("nope", UNKNOWN_ID, { action: "flag" }),
      "memberId",
    );
    expectInvalid(
      await s.setAction(UNKNOWN_ID, "nope", { action: "flag" }),
      "typeId",
    );
  });

  test("E34 a malformed member id or assessment id is 400", async () => {
    expectInvalid(await s.clearAction("nope", UNKNOWN_ID), "memberId");
    expectInvalid(await s.clearAction(UNKNOWN_ID, "nope"), "typeId");
  });
});

describe("BR-REC-154 E33 body (contract: Request limits)", () => {
  const bad: [string, unknown, string][] = [
    ["an empty object", {}, "action"],
    ["an unknown action", { action: "nope" }, "action"],
    [
      "the old word 'remind'",
      { action: "remind", until: "2099-01-01" },
      "action",
    ],
    ["action as a number", { action: 1 }, "action"],
    ["flag with an until", { action: "flag", until: "2099-01-01" }, ""],
    ["flag with another key", { action: "flag", note: "x" }, ""],
    ["snooze without an until", { action: "snooze" }, "until"],
    ["snooze with until null", { action: "snooze", until: null }, "until"],
    [
      "snooze with a number as until",
      { action: "snooze", until: 20261010 },
      "until",
    ],
    [
      "snooze with another date format",
      { action: "snooze", until: "10/10/2026" },
      "until",
    ],
    [
      "snooze with a one-digit month",
      { action: "snooze", until: "2026-1-5" },
      "until",
    ],
    [
      "snooze with month 13",
      { action: "snooze", until: "2026-13-01" },
      "until",
    ],
    [
      "snooze with 31 February",
      { action: "snooze", until: "2026-02-31" },
      "until",
    ],
    [
      "snooze with a time",
      { action: "snooze", until: "2026-10-10T10:00:00Z" },
      "until",
    ],
    [
      "snooze with another key",
      { action: "snooze", until: "2099-01-01", x: 1 },
      "",
    ],
    ["an array", [{ action: "flag" }], ""],
  ];
  for (const [label, body, path] of bad) {
    test(`${label} is 400 VALIDATION_ERROR and changes nothing`, async () => {
      const type = await s.makeWeeklyType(["Weight"]);
      const member = await s.makeMember();
      const actor = await s.newActor();
      const reply = await s.setAction(member.id, type.id, body, {
        token: actor.token,
      });
      if (path) expectInvalid(reply, path);
      else expectInvalid(reply);
      expect(await s.overrideRows(member.id, type.id)).toHaveLength(0);
      expect(await s.audit(actor.sid)).toHaveLength(0);
    });
  }

  test("a body that is not JSON is 400 INVALID_JSON", async () => {
    const reply = await call(
      s.app,
      "PUT",
      PATH.action(UNKNOWN_ID, UNKNOWN_ID),
      {
        token: s.token,
        rawBody: "{ not json",
      },
    );
    expectError(reply, 400, "INVALID_JSON");
  });

  test("a bad body is 400 even when the member does not exist (validation comes before the lookup)", async () => {
    expectInvalid(
      await s.setAction(UNKNOWN_ID, OTHER_UNKNOWN_ID, { action: "nope" }),
      "action",
    );
    expectInvalid(
      await s.setAction(UNKNOWN_ID, OTHER_UNKNOWN_ID, { action: "snooze" }),
      "until",
    );
  });

  test("bad ids in the path are 400 whatever the body says", async () => {
    expectInvalid(await s.setAction("nope", "nope", { action: "flag" }));
  });
});
