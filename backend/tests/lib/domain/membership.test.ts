import { describe, expect, test } from "bun:test";
import {
  membershipEnd,
  membershipStatus,
} from "../../../src/lib/domain/membership";
import type { MembershipStatus, Plan } from "../../../src/lib/enums";
import cases from "../../fixtures/membership-end-cases.json";

// Golden fixture shared byte-identically with the frontend (membership-end-cases.json).

describe("membershipEnd (golden fixture)", () => {
  for (const c of cases.end) {
    test(`BR-REC-51 ${c.plan} from ${c.startOn} ends ${c.endOn}`, () => {
      expect(membershipEnd(c.plan as Plan, c.startOn)).toBe(c.endOn);
    });
  }

  test("BR-REC-51 monthly from 31 Jan 2026 ends 28 Feb 2026 (the date does not exist, so the last day of that month)", () => {
    expect(membershipEnd("monthly", "2026-01-31")).toBe("2026-02-28");
  });

  test("BR-REC-51 annual from 29 Feb 2028 ends 28 Feb 2029", () => {
    expect(membershipEnd("annual", "2028-02-29")).toBe("2029-02-28");
  });
});

describe("membershipStatus (golden fixture)", () => {
  for (const c of cases.status) {
    const label = c.latest
      ? `period ${c.latest.startOn}..${c.latest.endOn}, today ${c.today}, lead ${c.leadDays}`
      : `no period, today ${c.today}`;
    test(`BR-REC-52 ${label} -> ${c.expected ? `${c.expected.status}, ${c.expected.daysLeft} days left` : "null"}`, () => {
      expect(membershipStatus(c.latest, c.today, c.leadDays)).toEqual(
        c.expected
          ? {
              status: c.expected.status as MembershipStatus,
              daysLeft: c.expected.daysLeft,
            }
          : null,
      );
    });
  }

  test("BR-REC-52 a period ending today is Ends soon, with 0 days left", () => {
    expect(
      membershipStatus(
        { startOn: "2026-04-04", endOn: "2026-10-03" },
        "2026-10-03",
        14,
      ),
    ).toEqual({ status: "expiring", daysLeft: 0 });
  });

  test("BR-REC-52 the status walks Active, Ends soon, Ended as today moves past a fixed end date", () => {
    const end = Date.UTC(2026, 9, 17); // 2026-10-17
    const period = { startOn: "2026-04-18", endOn: "2026-10-17" };
    const lead = 14;
    const seen: string[] = [];
    for (let offset = -40; offset <= 10; offset++) {
      const t = new Date(end + offset * 86_400_000);
      const today = t.toISOString().slice(0, 10);
      const result = membershipStatus(period, today, lead);
      expect(result?.daysLeft).toBe(-offset);
      const expected: MembershipStatus =
        -offset < 0 ? "expired" : -offset <= lead ? "expiring" : "active";
      expect(result?.status).toBe(expected);
      if (result && seen[seen.length - 1] !== result.status)
        seen.push(result.status);
    }
    expect(seen).toEqual(["active", "expiring", "expired"]);
  });
});
