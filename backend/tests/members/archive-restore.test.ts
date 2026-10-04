import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "../../src/db/client";
import { assessments } from "../../src/db/schemas";
import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  dataOf,
  type EndingItem,
  expectError,
  expectMemberShape,
  type ListItem,
  type MemberView,
  useMembersSuite,
} from "./support/suite";

// E20 POST /api/members/:memberId/archive and E21 POST .../restore.
// BR-REC-06 (archived, never deleted; vanish from search and Home; history stays; restorable),
// BR-REC-58 (Restore always works), BR-REC-57 (the Archived chip), BR-REC-53 (Home never
// lists archived members), BR-REC-158 (change log).

const s = useMembersSuite();

const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Ids found by a search for exactly this member's name, under the given status filter. */
async function foundIds(fullName: string, status?: string): Promise<string[]> {
  const reply = await s.list({ q: fullName, status, pageSize: 100 });
  return dataOf<ListItem[]>(reply).map((item) => item.id);
}

describe("E20 archive a member (BR-REC-06)", () => {
  test("BR-REC-06 archiving sets archivedAt to now (an ISO UTC moment) and answers the member", async () => {
    const m = await s.seedMember({ name: "Archive Now" });
    const before = Date.now();
    const member = dataOf<MemberView>(await s.archive(m.id));
    const after = Date.now();
    expect(member.id).toBe(m.id);
    expect(member.archivedAt).toMatch(ISO_MOMENT);
    const at = new Date(member.archivedAt as string).getTime();
    expect(at).toBeGreaterThan(before - 60_000);
    expect(at).toBeLessThan(after + 60_000);
    expect((await s.memberRow(m.id))?.archivedAt?.getTime()).toBe(at);
  });

  test("BR-REC-06 / 59 the answer is the member as E18 shows it", async () => {
    const m = await s.seedMember({ name: "Shape Archive" });
    const member = dataOf<MemberView>(await s.archive(m.id));
    expectMemberShape(member);
    expect(dataOf<MemberView>(await s.getMember(m.id))).toEqual(member);
  });

  test("BR-REC-06 the member is not deleted: the member and every period are still there", async () => {
    const m = await s.seedMember({
      name: "Archive Keeps Rows",
      periods: [
        { plan: "monthly", startOn: s.day(-90), endOn: s.day(-61) },
        { plan: "annual", startOn: s.day(-60), endOn: s.day(304) },
      ],
    });
    const member = dataOf<MemberView>(await s.archive(m.id));
    expect(member.periods).toHaveLength(2);
    expect(await s.periodRows(m.id)).toHaveLength(2);
    expect(await s.memberRow(m.id)).toBeDefined();
  });

  test("BR-REC-06 history stays: assessments of an archived member are kept", async () => {
    const m = await s.seedMember({
      name: "Archive Keeps History",
      assessedOn: [s.day(-30), s.day(-10)],
    });
    dataOf<MemberView>(await s.archive(m.id));
    const rows = await db
      .select()
      .from(assessments)
      .where(eq(assessments.memberId, m.id));
    expect(rows).toHaveLength(2);
    // and the list shows the latest assessment of an archived member under the Archived chip
    const reply = await s.list({
      q: m.fullName,
      status: "archived",
      pageSize: 100,
    });
    const item = dataOf<ListItem[]>(reply).find((i) => i.id === m.id);
    expect(item?.lastAssessedOn).toBe(s.day(-10));
  });

  test("BR-REC-06 there is no way to delete a member: DELETE on the member is not a route", async () => {
    const m = await s.seedMember({ name: "No Delete" });
    const reply = await s.send("DELETE", `/api/members/${m.id}`);
    expect([404, 405]).toContain(reply.status);
    expect(await s.memberRow(m.id)).toBeDefined();
  });

  test("BR-REC-06 an archived member vanishes from search and from the default list", async () => {
    const m = await s.seedMember({ name: "Archive Vanishes" });
    expect(await foundIds(m.fullName)).toContain(m.id);
    dataOf<MemberView>(await s.archive(m.id));
    expect(await foundIds(m.fullName)).not.toContain(m.id);
    for (const status of ["active", "expiring", "expired"]) {
      expect(await foundIds(m.fullName, status)).not.toContain(m.id);
    }
  });

  test("BR-REC-57 the Archived chip lists them, and so does any", async () => {
    const m = await s.seedMember({ name: "Archive Chip" });
    dataOf<MemberView>(await s.archive(m.id));
    expect(await foundIds(m.fullName, "archived")).toContain(m.id);
    expect(await foundIds(m.fullName, "any")).toContain(m.id);
  });

  test("BR-REC-06 / 53 an archived member leaves Home: a membership that ends in 3 days is listed until archived, then not, and is back after restore", async () => {
    const m = await s.seedMember({
      name: "Archive Leaves Home",
      periods: [{ plan: "annual", startOn: s.day(-362), endOn: s.day(3) }],
    });
    const listed = async () => {
      const reply = await s.ending({ status: "expiring", pageSize: 100 });
      return dataOf<EndingItem[]>(reply).some((i) => i.memberId === m.id);
    };
    expect(await listed()).toBe(true);
    dataOf<MemberView>(await s.archive(m.id));
    expect(await listed()).toBe(false);
    dataOf<MemberView>(await s.restore(m.id));
    expect(await listed()).toBe(true);
  });

  test("BR-REC-06 archiving an archived member is 200 and keeps the first archivedAt", async () => {
    const first = new Date(Date.now() - 7 * 86_400_000);
    const m = await s.seedMember({ name: "Archive Twice", archived: first });
    const member = dataOf<MemberView>(await s.archive(m.id));
    expect(new Date(member.archivedAt as string).getTime()).toBe(
      first.getTime(),
    );
    expect((await s.memberRow(m.id))?.archivedAt?.getTime()).toBe(
      first.getTime(),
    );
  });

  test("BR-REC-158 archive writes one member.archive row: archivedAt null before, the moment after, this sign-in", async () => {
    const m = await s.seedMember({ name: "Archive Log" });
    const member = dataOf<MemberView>(await s.archive(m.id));
    const rows = await s.audit({ action: "member.archive", entityId: m.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: s.sessionId,
      entity: "member",
      entityId: m.id,
      before: { archivedAt: null },
    });
    const logged = (rows[0]?.after as { archivedAt: string } | undefined)
      ?.archivedAt as string;
    expect(new Date(logged).getTime()).toBe(
      new Date(member.archivedAt as string).getTime(),
    );
  });

  test("BR-REC-158 archiving an archived member again writes no second row", async () => {
    const m = await s.seedMember({ name: "Archive No Second Row" });
    dataOf<MemberView>(await s.archive(m.id));
    dataOf<MemberView>(await s.archive(m.id));
    expect(
      await s.audit({ action: "member.archive", entityId: m.id }),
    ).toHaveLength(1);
  });

  test("BR-REC-154 an unknown id is 404 NOT_FOUND and a malformed one is 400", async () => {
    expectError(await s.archive(UNKNOWN_ID), 404, "NOT_FOUND");
    expectError(await s.archive("nope"), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-154 archive needs no body and no Idempotency-Key", async () => {
    const m = await s.seedMember({ name: "Archive No Key" });
    const reply = await s.send("POST", `/api/members/${m.id}/archive`, {
      key: null,
    });
    expect(reply.status).toBe(200);
  });
});

describe("E21 restore a member (BR-REC-06, 58)", () => {
  test("BR-REC-06 restoring an archived member clears archivedAt and brings them back in search", async () => {
    const m = await s.seedMember({ name: "Restore Back", archived: true });
    expect(await foundIds(m.fullName)).not.toContain(m.id);
    const member = dataOf<MemberView>(await s.restore(m.id));
    expect(member.archivedAt).toBeNull();
    expect((await s.memberRow(m.id))?.archivedAt).toBeNull();
    expect(await foundIds(m.fullName)).toContain(m.id);
    expect(await foundIds(m.fullName, "archived")).not.toContain(m.id);
  });

  test("BR-REC-06 / 59 the answer is the member as E18 shows it", async () => {
    const m = await s.seedMember({ name: "Shape Restore", archived: true });
    const member = dataOf<MemberView>(await s.restore(m.id));
    expectMemberShape(member);
    expect(dataOf<MemberView>(await s.getMember(m.id))).toEqual(member);
  });

  test("BR-REC-58 the Restore button always works: also when the membership has ended", async () => {
    const m = await s.seedMember({
      name: "Restore Ended",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-500), endOn: s.day(-136) }],
    });
    const member = dataOf<MemberView>(await s.restore(m.id));
    expect(member.archivedAt).toBeNull();
    expect(member.membership.status).toBe("expired");
  });

  test("BR-REC-06 restoring does not touch the membership periods", async () => {
    const m = await s.seedMember({
      name: "Restore Keeps Periods",
      archived: true,
      periods: [{ plan: "annual", startOn: s.day(-100), endOn: s.day(264) }],
    });
    const before = await s.periodRows(m.id);
    dataOf<MemberView>(await s.restore(m.id));
    const after = await s.periodRows(m.id);
    expect(after).toHaveLength(before.length);
    expect(after[0]).toMatchObject({
      startOn: s.day(-100),
      endOn: s.day(264),
    });
  });

  test("BR-REC-06 restoring a member who is not archived is 200 and changes nothing", async () => {
    const m = await s.seedMember({ name: "Restore Not Archived" });
    const member = dataOf<MemberView>(await s.restore(m.id));
    expect(member.archivedAt).toBeNull();
    expect(await s.audit({ action: "member.restore", entityId: m.id })).toEqual(
      [],
    );
  });

  test("BR-REC-158 restore writes one member.restore row: the old archivedAt before, null after", async () => {
    const archivedAt = new Date(Date.now() - 86_400_000);
    const m = await s.seedMember({ name: "Restore Log", archived: archivedAt });
    dataOf<MemberView>(await s.restore(m.id));
    const rows = await s.audit({ action: "member.restore", entityId: m.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: s.sessionId,
      entity: "member",
      entityId: m.id,
      after: { archivedAt: null },
    });
    const logged = (rows[0]?.before as { archivedAt: string } | undefined)
      ?.archivedAt as string;
    expect(new Date(logged).getTime()).toBe(archivedAt.getTime());
  });

  test("BR-REC-158 archive, restore, archive again: three rows in that order", async () => {
    const m = await s.seedMember({ name: "Archive Round Trip" });
    dataOf<MemberView>(await s.archive(m.id));
    dataOf<MemberView>(await s.restore(m.id));
    dataOf<MemberView>(await s.archive(m.id));
    const rows = await s.auditAbout(m.id);
    expect(rows.map((r) => r.action)).toEqual([
      "member.archive",
      "member.restore",
      "member.archive",
    ]);
  });

  test("BR-REC-154 an unknown id is 404 NOT_FOUND and a malformed one is 400", async () => {
    expectError(await s.restore(OTHER_UNKNOWN_ID), 404, "NOT_FOUND");
    expectError(await s.restore("nope"), 400, "VALIDATION_ERROR");
  });
});
