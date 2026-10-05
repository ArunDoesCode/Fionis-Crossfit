// Spec: docs/specs/member-records/performance.md BR-REC-212 (U6 part: E18 parallel reads, pool config, archived skipped in SQL).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { db } from "../../src/db/client";
import { dueRepository } from "../../src/repository/dueRepository";
import { useDueSuite } from "../due/support";

const s = useDueSuite();
const read = (p: string) =>
  readFileSync(join(import.meta.dir, "..", "..", p), "utf8");

describe("BR-REC-212", () => {
  test("BR-REC-212 the due engine's member read leaves archived members out (in SQL)", async () => {
    const live = await s.makeMember({ name: "perf_live" });
    const gone = await s.makeMember({ name: "perf_archived", archived: true });
    const rows = await dueRepository.listMembers(db);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);
  });

  test("BR-REC-212 E18 reads settings, member and periods in parallel", () => {
    const src = read("src/service/membersService.ts");
    const start = src.indexOf("async get(memberId");
    const body = src.slice(start, src.indexOf("toMemberDetail", start));
    expect(body).toContain("Promise.all");
  });

  test("BR-REC-212 the database pool sets max and idle_timeout", () => {
    const src = read("src/db/client.ts");
    expect(src).toMatch(/\bmax\s*:/);
    expect(src).toMatch(/idle_timeout\s*:/);
  });
});
