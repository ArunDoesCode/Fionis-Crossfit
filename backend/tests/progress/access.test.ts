import { beforeAll, describe, expect, test } from "bun:test";
import { forgedToken } from "../helpers/http";
import {
  dataOf,
  expectError,
  type MadeMetric,
  useProgressSuite,
} from "./support/suite";

// "Who can do what": view, print and export are for the shared login (progress spec). All five
// endpoints E35-E39 need the sign-in (401 UNAUTHORIZED without), are reads, and write no change-log row.

const s = useProgressSuite();

let metric: MadeMetric;
let memberId = "";

beforeAll(async () => {
  metric = await s.makeSingleMetric({ better: "lower" });
  const member = await s.makeMember({ name: "Access Check" });
  memberId = member.id;
  await s.series(member.id, metric, [
    [s.day(-60), 30],
    [s.day(-30), 28],
  ]);
});

const UNKNOWN = "00000000-0000-4000-8000-000000000001";

function paths(): [string, string][] {
  return [
    ["E35 report card", `/api/members/${memberId}/report-card`],
    ["E36 gym progress", `/api/reports/progress?metricId=${metric.id}`],
    [
      "E37 leaderboard",
      `/api/reports/leaderboard?metricId=${metric.id}&sex=male`,
    ],
    ["E38 active by plan", "/api/reports/active-by-plan"],
    ["E39 members CSV", "/api/exports/members.csv"],
    ["E39 memberships CSV", "/api/exports/memberships.csv"],
    ["E39 measurements CSV", "/api/exports/measurements.csv"],
  ];
}

describe("progress access: the shared login only", () => {
  test("BR-REC-22 / 23 / 24 every progress endpoint answers 401 UNAUTHORIZED without a sign-in", async () => {
    for (const [label, path] of paths()) {
      const res = await s.rawGet(path, { token: null });
      expect({ label, status: res.status }).toEqual({ label, status: 401 });
      const body = (await res.json()) as { success: boolean; code: string };
      expect({ label, code: body.code, success: body.success }).toEqual({
        label,
        code: "UNAUTHORIZED",
        success: false,
      });
    }
  });

  test("BR-REC-22 / 23 / 24 a token signed with another secret is refused", async () => {
    const forged = await forgedToken();
    for (const [label, path] of paths()) {
      const res = await s.rawGet(path, { token: forged });
      expect({ label, status: res.status }).toEqual({ label, status: 401 });
      await res.body?.cancel();
    }
  });

  test("BR-REC-22 the signed-out answer is the same for an unknown member (no 404 leak)", async () => {
    const res = await s.rawGet(`/api/members/${UNKNOWN}/report-card`, {
      token: null,
    });
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });

  test("progress reads write no change-log row (the whole log is unchanged after every endpoint)", async () => {
    const before = await s.auditCount();
    const replies = [
      await s.reportCard(memberId),
      await s.progress({ metricId: metric.id }),
      await s.leaderboard({ metricId: metric.id, sex: "male" }),
      await s.activeByPlan(),
    ];
    for (const reply of replies) expect(reply.status).toBe(200);
    for (const file of ["members.csv", "memberships.csv", "measurements.csv"]) {
      const res = await s.rawGet(`/api/exports/${file}`);
      expect(res.status).toBe(200);
      await res.text();
    }
    expect(await s.auditCount()).toBe(before);
  });

  test("progress reads change nothing they read (the member and the readings are the same after)", async () => {
    const first = dataOf<{ types: unknown }>(await s.reportCard(memberId));
    await s.progress({ metricId: metric.id });
    await s.leaderboard({ metricId: metric.id, sex: "male" });
    const second = dataOf<{ types: unknown }>(await s.reportCard(memberId));
    expect(second.types).toEqual(first.types);
  });

  test("progress errors use the envelope: success false, a message and a code", async () => {
    const reply = await s.reportCard(UNKNOWN);
    expectError(reply, 404, "NOT_FOUND");
  });
});
