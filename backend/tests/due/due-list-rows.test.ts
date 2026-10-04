import { describe, expect, test } from "bun:test";

import {
  type DueStatus,
  dueListRows,
  isListedInDueList,
  memberDueItems,
} from "../../src/lib/domain/due";

// Pure row builders (BR-REC-16, 17, 18, 96, 97, 98, 99; due-list.md C2-C5, C7, C10).
// Statuses are written out by hand (what `computeDue` would hand over), so these tests
// do not depend on the engine: only on the shaping, filtering and ordering rules.

const item = (id: string, name = id) => ({ metricId: id, name });

let counter = 0;
function status(extra: Partial<DueStatus> = {}): DueStatus {
  counter += 1;
  const n = String(counter).padStart(4, "0");
  return {
    memberId: `00000000-0000-4000-8000-00000000${n}`,
    fullName: `Member ${n}`,
    typeId: "00000000-0000-4000-8000-0000000000bc",
    typeName: "Body composition",
    typeSortOrder: 1,
    state: "overdue",
    neverRecorded: false,
    nextDueOn: "2026-09-30",
    daysOverdue: 3,
    dueItems: [item("weight", "Weight")],
    allItems: [item("weight", "Weight"), item("bodyfat", "Body fat")],
    flagged: false,
    snoozedUntil: null,
    ...extra,
  };
}

const names = (rows: { fullName: string }[]) => rows.map((r) => r.fullName);

describe("E31 rows: which tab, what a row holds (BR-REC-16, 96; C2, C4, C7)", () => {
  test("BR-REC-16 an overdue status is a row in the overdue tab with the due items as chips", () => {
    const s = status({
      fullName: "Surya Pratap",
      dueItems: [item("weight", "Weight"), item("bodyfat", "Body fat")],
    });
    expect(dueListRows([s], "overdue")).toEqual([
      {
        memberId: s.memberId,
        fullName: "Surya Pratap",
        typeId: s.typeId,
        typeName: "Body composition",
        dueOn: "2026-09-30",
        daysOverdue: 3,
        flagged: false,
        items: [item("weight", "Weight"), item("bodyfat", "Body fat")],
      },
    ]);
  });

  test("BR-REC-96 an overdue status is not in the upcoming tab", () => {
    expect(dueListRows([status()], "upcoming")).toEqual([]);
  });

  test("BR-REC-96 an upcoming status is in the upcoming tab only, with dueOn = nextDueOn", () => {
    const s = status({
      state: "upcoming",
      nextDueOn: "2026-10-06",
      daysOverdue: -3,
    });
    const [row] = dueListRows([s], "upcoming");
    expect(row?.dueOn).toBe("2026-10-06");
    expect(row?.daysOverdue).toBe(-3);
    expect(row?.flagged).toBe(false);
    expect(dueListRows([s], "overdue")).toEqual([]);
  });

  test("BR-REC-96 a status that is due today is in the upcoming tab (Due soon, 'Due today')", () => {
    const s = status({
      state: "upcoming",
      nextDueOn: "2026-10-03",
      daysOverdue: 0,
    });
    expect(dueListRows([s], "upcoming")).toHaveLength(1);
    expect(dueListRows([s], "overdue")).toEqual([]);
  });

  test("BR-REC-16 a status that is ok (nothing due) is in no tab", () => {
    const s = status({
      state: "ok",
      nextDueOn: "2026-12-03",
      daysOverdue: -61,
      dueItems: [],
    });
    expect(dueListRows([s], "overdue")).toEqual([]);
    expect(dueListRows([s], "upcoming")).toEqual([]);
  });

  test("C2 the chips of a row are the due items, not every item", () => {
    const [row] = dueListRows([status()], "overdue");
    expect(row?.items.map((i) => i.metricId)).toEqual(["weight"]);
  });

  test("BR-REC-99 C7 a row with an active reminder is in neither tab", () => {
    const overdue = status({ snoozedUntil: "2026-10-20" });
    const upcoming = status({
      state: "upcoming",
      nextDueOn: "2026-10-05",
      daysOverdue: -2,
      snoozedUntil: "2026-10-20",
    });
    expect(dueListRows([overdue, upcoming], "overdue")).toEqual([]);
    expect(dueListRows([overdue, upcoming], "upcoming")).toEqual([]);
  });

  test("BR-REC-99 a reminder hides one row only: another member's row of the same assessment stays", () => {
    const hidden = status({ fullName: "Hidden", snoozedUntil: "2026-10-20" });
    const shown = status({ fullName: "Shown" });
    expect(names(dueListRows([hidden, shown], "overdue"))).toEqual(["Shown"]);
  });

  test("Case 12 BR-REC-98 an Assess soon status is a row in overdue with every item as chips", () => {
    const s = status({
      fullName: "Anita Rao",
      typeName: "Fitness test",
      flagged: true,
      state: "ok",
      nextDueOn: "2026-12-03",
      daysOverdue: -61,
      dueItems: [],
      allItems: [item("f1"), item("f2"), item("f3")],
    });
    const [row] = dueListRows([s], "overdue");
    expect(row?.flagged).toBe(true);
    expect(row?.items.map((i) => i.metricId)).toEqual(["f1", "f2", "f3"]);
    expect(row?.dueOn).toBe("2026-12-03");
    expect(row?.daysOverdue).toBe(-61);
    expect(dueListRows([s], "upcoming")).toEqual([]);
  });

  test("C4 an Assess soon status whose dates say upcoming is still only in overdue", () => {
    const s = status({
      flagged: true,
      state: "upcoming",
      nextDueOn: "2026-10-05",
      daysOverdue: -2,
      dueItems: [item("weight")],
    });
    expect(dueListRows([s], "overdue")).toHaveLength(1);
    expect(dueListRows([s], "upcoming")).toEqual([]);
  });

  test("C4 an Assess soon status that is also overdue shows every item, not only the due ones", () => {
    const s = status({ flagged: true });
    const [row] = dueListRows([s], "overdue");
    expect(row?.items.map((i) => i.metricId)).toEqual(["weight", "bodyfat"]);
  });

  test("C4 one row per member and assessment: a flagged status never appears twice", () => {
    const s = status({ flagged: true });
    expect(dueListRows([s], "overdue")).toHaveLength(1);
    expect(dueListRows([s], "upcoming")).toHaveLength(0);
  });

  test("E31 no statuses, no rows", () => {
    expect(dueListRows([], "overdue")).toEqual([]);
    expect(dueListRows([], "upcoming")).toEqual([]);
  });

  test("E31 the function returns every row (paging is the service's job)", () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      status({ fullName: `Name ${String(i).padStart(2, "0")}` }),
    );
    expect(dueListRows(many, "overdue")).toHaveLength(60);
  });
});

describe("BR-REC-97 order (C5)", () => {
  test("BR-REC-97 an Assess soon row is above a 90-day overdue row", () => {
    const ninety = status({
      fullName: "Long overdue",
      nextDueOn: "2026-07-05",
      daysOverdue: 90,
    });
    const flagged = status({
      fullName: "Anita Rao",
      flagged: true,
      state: "ok",
      nextDueOn: "2026-12-03",
      daysOverdue: -61,
      dueItems: [],
    });
    expect(names(dueListRows([ninety, flagged], "overdue"))).toEqual([
      "Anita Rao",
      "Long overdue",
    ]);
  });

  test("BR-REC-97 Assess soon rows first, then most days overdue, then less overdue", () => {
    const rows = dueListRows(
      [
        status({
          fullName: "d 3 days",
          nextDueOn: "2026-09-30",
          daysOverdue: 3,
        }),
        status({
          fullName: "c 90 days",
          nextDueOn: "2026-07-05",
          daysOverdue: 90,
        }),
        status({
          fullName: "a flagged later",
          flagged: true,
          nextDueOn: "2026-12-01",
          daysOverdue: -59,
        }),
        status({
          fullName: "e 1 day",
          nextDueOn: "2026-10-02",
          daysOverdue: 1,
        }),
      ],
      "overdue",
    );
    expect(names(rows)).toEqual([
      "a flagged later",
      "c 90 days",
      "d 3 days",
      "e 1 day",
    ]);
  });

  test("C5 flagged rows are ordered among themselves by dueOn, earliest first", () => {
    const rows = dueListRows(
      [
        status({
          fullName: "Later",
          flagged: true,
          nextDueOn: "2026-11-10",
          daysOverdue: -38,
        }),
        status({
          fullName: "Earlier",
          flagged: true,
          nextDueOn: "2026-09-01",
          daysOverdue: 32,
        }),
        status({
          fullName: "Middle",
          flagged: true,
          nextDueOn: "2026-10-03",
          daysOverdue: 0,
        }),
      ],
      "overdue",
    );
    expect(names(rows)).toEqual(["Earlier", "Middle", "Later"]);
  });

  test("BR-REC-97 in Due soon the soonest due row comes first", () => {
    const rows = dueListRows(
      [
        status({
          fullName: "In 5 days",
          state: "upcoming",
          nextDueOn: "2026-10-08",
          daysOverdue: -5,
        }),
        status({
          fullName: "Today",
          state: "upcoming",
          nextDueOn: "2026-10-03",
          daysOverdue: 0,
        }),
        status({
          fullName: "In 3 days",
          state: "upcoming",
          nextDueOn: "2026-10-06",
          daysOverdue: -3,
        }),
      ],
      "upcoming",
    );
    expect(names(rows)).toEqual(["Today", "In 3 days", "In 5 days"]);
  });

  test("BR-REC-97 equal dates: name A-Z, ignoring case", () => {
    const rows = dueListRows(
      [
        status({ fullName: "Bala K" }),
        status({ fullName: "anita rao" }),
        status({ fullName: "Chitra" }),
        status({ fullName: "ankit" }),
      ],
      "overdue",
    );
    expect(names(rows)).toEqual(["anita rao", "ankit", "Bala K", "Chitra"]);
  });

  test("C5 equal date and name: the assessment's setup order", () => {
    const second = status({
      fullName: "Same Name",
      typeId: "00000000-0000-4000-8000-0000000000f2",
      typeName: "Fitness test",
      typeSortOrder: 2,
    });
    const first = status({
      fullName: "Same Name",
      typeId: "00000000-0000-4000-8000-0000000000bc",
      typeName: "Body composition",
      typeSortOrder: 1,
    });
    const rows = dueListRows([second, first], "overdue");
    expect(rows.map((r) => r.typeName)).toEqual([
      "Body composition",
      "Fitness test",
    ]);
  });

  test("C5 equal date, name and assessment: the member id decides, so the order is the same on every call", () => {
    const high = status({
      fullName: "Same Name",
      memberId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    });
    const low = status({
      fullName: "Same Name",
      memberId: "00000000-0000-4000-8000-000000000001",
    });
    expect(dueListRows([high, low], "overdue").map((r) => r.memberId)).toEqual([
      low.memberId,
      high.memberId,
    ]);
    expect(dueListRows([low, high], "overdue").map((r) => r.memberId)).toEqual([
      low.memberId,
      high.memberId,
    ]);
  });

  test("C5 date before name: a later name with an earlier date comes first", () => {
    const rows = dueListRows(
      [
        status({ fullName: "Aaron", nextDueOn: "2026-10-02", daysOverdue: 1 }),
        status({ fullName: "Zed", nextDueOn: "2026-09-01", daysOverdue: 32 }),
      ],
      "overdue",
    );
    expect(names(rows)).toEqual(["Zed", "Aaron"]);
  });

  test("C5 (contract) names compare by code unit after lower-casing: 'zara' sorts before 'Édith'", () => {
    const rows = dueListRows(
      [status({ fullName: "Édith" }), status({ fullName: "zara" })],
      "overdue",
    );
    expect(names(rows)).toEqual(["zara", "Édith"]);
  });

  test("C5 date before assessment: an earlier due date of a later assessment comes first", () => {
    const later = status({
      fullName: "Same Name",
      typeSortOrder: 2,
      typeName: "Fitness test",
      nextDueOn: "2026-09-01",
      daysOverdue: 32,
    });
    const earlier = status({
      fullName: "Same Name",
      typeSortOrder: 1,
      typeName: "Body composition",
      nextDueOn: "2026-09-30",
      daysOverdue: 3,
    });
    expect(
      dueListRows([earlier, later], "overdue").map((r) => r.typeName),
    ).toEqual(["Fitness test", "Body composition"]);
  });

  test("BR-REC-97 the order does not depend on the order the statuses came in", () => {
    const all = [
      status({ fullName: "Bala", nextDueOn: "2026-09-30", daysOverdue: 3 }),
      status({ fullName: "Anita", nextDueOn: "2026-09-30", daysOverdue: 3 }),
      status({
        fullName: "Chitra",
        flagged: true,
        nextDueOn: "2026-11-01",
        daysOverdue: -29,
      }),
      status({ fullName: "Dev", nextDueOn: "2026-08-01", daysOverdue: 63 }),
    ];
    const forward = names(dueListRows(all, "overdue"));
    const backward = names(dueListRows([...all].reverse(), "overdue"));
    expect(forward).toEqual(["Chitra", "Dev", "Anita", "Bala"]);
    expect(backward).toEqual(forward);
  });
});

describe("E32 lines (BR-REC-103; C10)", () => {
  test("C10 one line per status, in the order given, with the status facts", () => {
    const a = status({
      typeId: "00000000-0000-4000-8000-0000000000bc",
      typeName: "Body composition",
      typeSortOrder: 1,
      state: "overdue",
      neverRecorded: true,
      nextDueOn: "2026-06-01",
      daysOverdue: 124,
      dueItems: [item("weight", "Weight")],
    });
    const b = status({
      typeId: "00000000-0000-4000-8000-0000000000f2",
      typeName: "Fitness test",
      typeSortOrder: 2,
      state: "upcoming",
      nextDueOn: "2026-10-05",
      daysOverdue: -2,
      dueItems: [item("f1", "Push-ups")],
    });
    expect(memberDueItems([a, b])).toEqual([
      {
        typeId: a.typeId,
        typeName: "Body composition",
        state: "overdue",
        neverRecorded: true,
        nextDueOn: "2026-06-01",
        daysOverdue: 124,
        flagged: false,
        snoozedUntil: null,
        items: [item("weight", "Weight")],
      },
      {
        typeId: b.typeId,
        typeName: "Fitness test",
        state: "upcoming",
        neverRecorded: false,
        nextDueOn: "2026-10-05",
        daysOverdue: -2,
        flagged: false,
        snoozedUntil: null,
        items: [item("f1", "Push-ups")],
      },
    ]);
  });

  test("C10 a status that is ok and not flagged has no items", () => {
    const [line] = memberDueItems([
      status({
        state: "ok",
        nextDueOn: "2026-11-10",
        daysOverdue: -38,
        dueItems: [],
      }),
    ]);
    expect(line?.state).toBe("ok");
    expect(line?.items).toEqual([]);
  });

  test("C10 a flagged status lists every turned-on measurement, while state stays from the dates", () => {
    const [line] = memberDueItems([
      status({
        flagged: true,
        state: "ok",
        nextDueOn: "2026-11-10",
        daysOverdue: -38,
        dueItems: [],
      }),
    ]);
    expect(line?.flagged).toBe(true);
    expect(line?.state).toBe("ok");
    expect(line?.items.map((i) => i.metricId)).toEqual(["weight", "bodyfat"]);
  });

  test("C10 a reminder shows its day; the row is not hidden here and the dates stay as they are", () => {
    const [line] = memberDueItems([status({ snoozedUntil: "2026-10-20" })]);
    expect(line?.snoozedUntil).toBe("2026-10-20");
    expect(line?.state).toBe("overdue");
    expect(line?.daysOverdue).toBe(3);
    expect(line?.items.map((i) => i.metricId)).toEqual(["weight"]);
  });

  test("C10 no statuses, no lines", () => {
    expect(memberDueItems([])).toEqual([]);
  });
});

describe("BR-REC-17 who is left out of the due lists (C3)", () => {
  const TODAY = "2026-10-03";
  const period = (startOn: string, endOn: string) => ({ startOn, endOn });

  test("Case 10 BR-REC-17 a membership that ended 2 Oct: not listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2025-10-03", "2026-10-02"),
        },
        TODAY,
      ),
    ).toBe(false);
  });

  test("Case 11 BR-REC-17 a membership that ends 8 Oct (Ends soon): listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2025-10-09", "2026-10-08"),
        },
        TODAY,
      ),
    ).toBe(true);
  });

  test("Case 16 BR-REC-17 an archived member: not listed", () => {
    expect(
      isListedInDueList(
        {
          archived: true,
          latestMembership: period("2026-01-01", "2026-12-31"),
        },
        TODAY,
      ),
    ).toBe(false);
  });

  test("BR-REC-17 an archived member with an ended membership: not listed", () => {
    expect(
      isListedInDueList(
        {
          archived: true,
          latestMembership: period("2025-01-01", "2025-12-31"),
        },
        TODAY,
      ),
    ).toBe(false);
  });

  test("BR-REC-17 an archived member with no membership: not listed", () => {
    expect(
      isListedInDueList({ archived: true, latestMembership: null }, TODAY),
    ).toBe(false);
  });

  test("C3 a member with no membership at all is not Ended: listed", () => {
    expect(
      isListedInDueList({ archived: false, latestMembership: null }, TODAY),
    ).toBe(true);
  });

  test("BR-REC-17 a membership ending today still counts (Ends soon): listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2025-10-04", "2026-10-03"),
        },
        TODAY,
      ),
    ).toBe(true);
  });

  test("BR-REC-17 a membership that ended yesterday is Ended: not listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2025-10-03", "2026-10-02"),
        },
        "2026-10-03",
      ),
    ).toBe(false);
  });

  test("BR-REC-17 an Active membership far from its end: listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2026-06-01", "2027-05-31"),
        },
        TODAY,
      ),
    ).toBe(true);
  });

  test("C3 a renewal that has not started yet (Active) is listed", () => {
    expect(
      isListedInDueList(
        {
          archived: false,
          latestMembership: period("2026-11-01", "2027-10-31"),
        },
        TODAY,
      ),
    ).toBe(true);
  });

  test("BR-REC-17 the same member is listed one day and left out the day after the end", () => {
    const member = {
      archived: false,
      latestMembership: period("2025-10-04", "2026-10-03"),
    };
    expect(isListedInDueList(member, "2026-10-03")).toBe(true);
    expect(isListedInDueList(member, "2026-10-04")).toBe(false);
  });
});
