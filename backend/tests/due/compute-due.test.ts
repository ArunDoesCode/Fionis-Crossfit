import { describe, expect, test } from "bun:test";

import {
  type ComputeDueInput,
  computeDue,
  type DueAssessmentType,
  type DueLastMeasured,
  type DueMeasurement,
  type DueMember,
  type DueOverride,
  type DueStatus,
  dueListRows,
} from "../../src/lib/domain/due";

// Pure engine (BR-REC-15, 16, 93, 94, 95, 96, 98, 99, 105; due-list.md C1, C2, C4, C6, C7, C10).
// The spec's "Due examples" run with: today 2026-10-03, Due soon 7 days, Body composition every
// 1 month, Fitness test every 2 months, Fran its own 3 months, member joined 2026-06-01.
// Expected values are written out from the spec; nothing is computed with the code under test.

const TODAY = "2026-10-03";
const JOINED = "2026-06-01";
const MEMBER = "member-1";

function metric(
  id: string,
  name: string,
  sortOrder: number,
  extra: Partial<DueMeasurement> = {},
): DueMeasurement {
  return {
    id,
    name,
    isActive: true,
    sortOrder,
    intervalCount: null,
    intervalUnit: null,
    ...extra,
  };
}

function bodyComposition(
  options: { bodyAgeOn?: boolean } = {},
): DueAssessmentType {
  return {
    id: "bc",
    name: "Body composition",
    isActive: true,
    sortOrder: 1,
    intervalCount: 1,
    intervalUnit: "month",
    measurements: [
      metric("weight", "Weight", 1),
      metric("bodyfat", "Body fat", 2),
      metric("muscle", "Muscle mass", 3),
      metric("water", "Body water", 4),
      metric("bodyage", "Body age", 5, { isActive: options.bodyAgeOn ?? true }),
    ],
  };
}

const FITNESS_NAMES = [
  "Push-ups",
  "Pull-ups",
  "Fran",
  "Squats",
  "Sit-ups",
  "Burpees",
  "Rowing 500 m",
  "Plank",
  "Deadlift",
  "Back squat",
  "Bench press",
  "Box jumps",
  "Run 1 km",
  "Wall balls",
];

/** 14 measurements; `f1` Push-ups, `f2` Pull-ups, `f3` Fran (its own 3 months). */
function fitnessTest(): DueAssessmentType {
  return {
    id: "ft",
    name: "Fitness test",
    isActive: true,
    sortOrder: 2,
    intervalCount: 2,
    intervalUnit: "month",
    measurements: FITNESS_NAMES.map((name, i) =>
      metric(
        `f${i + 1}`,
        name,
        i + 1,
        name === "Fran" ? { intervalCount: 3, intervalUnit: "month" } : {},
      ),
    ),
  };
}

/** A third assessment holding the "2-week item" of case 6. */
function weeklyCheck(): DueAssessmentType {
  return {
    id: "wk",
    name: "Weekly check",
    isActive: true,
    sortOrder: 3,
    intervalCount: 1,
    intervalUnit: "month",
    measurements: [
      metric("sleep", "Sleep score", 1, {
        intervalCount: 2,
        intervalUnit: "week",
      }),
    ],
  };
}

type Run = {
  /** measurement id -> latest value day; null = never recorded; missing = recorded today (not due for long) */
  last?: Record<string, string | null>;
  today?: string;
  lead?: number;
  overrides?: DueOverride[];
  types?: DueAssessmentType[];
  members?: DueMember[];
  lastMeasured?: DueLastMeasured[];
};

function run(options: Run = {}): DueStatus[] {
  const types = options.types ?? [
    bodyComposition(),
    fitnessTest(),
    weeklyCheck(),
  ];
  const members = options.members ?? [
    { id: MEMBER, fullName: "Surya Pratap", joinedOn: JOINED },
  ];
  let lastMeasured = options.lastMeasured;
  if (!lastMeasured) {
    lastMeasured = [];
    for (const member of members) {
      for (const type of types) {
        for (const m of type.measurements) {
          const day = options.last?.[m.id];
          if (day === null) continue;
          lastMeasured.push({
            memberId: member.id,
            metricId: m.id,
            measuredOn: day ?? TODAY,
          });
        }
      }
    }
  }
  const input: ComputeDueInput = {
    today: options.today ?? TODAY,
    upcomingLeadDays: options.lead ?? 7,
    members,
    types,
    lastMeasured,
    overrides: options.overrides ?? [],
  };
  return computeDue(input);
}

function pick(statuses: DueStatus[], typeId: string, memberId = MEMBER) {
  const found = statuses.find(
    (s) => s.typeId === typeId && s.memberId === memberId,
  );
  if (!found) throw new Error(`no status for ${memberId} / ${typeId}`);
  return found;
}

const ids = (items: { metricId: string }[]) => items.map((i) => i.metricId);

describe("Due examples, one measurement at a time (BR-REC-15, 16, 96, 105)", () => {
  test("Case 1 BR-REC-96 weight last 2026-09-10 is due 10 Oct: Due soon, 7 days ahead", () => {
    const s = pick(run({ last: { weight: "2026-09-10" } }), "bc");
    expect(s.state).toBe("upcoming");
    expect(s.nextDueOn).toBe("2026-10-10");
    expect(s.daysOverdue).toBe(-7);
    expect(ids(s.dueItems)).toEqual(["weight"]);
  });

  test("Case 2 BR-REC-15 weight last 2026-08-31 is due 30 Sep: Overdue 3 days", () => {
    const s = pick(run({ last: { weight: "2026-08-31" } }), "bc");
    expect(s.state).toBe("overdue");
    expect(s.nextDueOn).toBe("2026-09-30");
    expect(s.daysOverdue).toBe(3);
    expect(ids(s.dueItems)).toEqual(["weight"]);
  });

  test("Case 3 BR-REC-15 Fran last 2026-08-10 uses its own 3 months (due 10 Nov): the fitness test is not due", () => {
    const statuses = run({ last: { f3: "2026-08-10" } });
    const s = pick(statuses, "ft");
    expect(s.state).toBe("ok");
    expect(s.dueItems).toEqual([]);
    // the earliest due date is Fran's: 10 Nov (the other items were done today: 3 Dec)
    expect(s.nextDueOn).toBe("2026-11-10");
    expect(s.daysOverdue).toBe(-38);
    expect(dueListRows(statuses, "overdue").map((r) => r.typeId)).not.toContain(
      "ft",
    );
    expect(
      dueListRows(statuses, "upcoming").map((r) => r.typeId),
    ).not.toContain("ft");
  });

  test("Case 4 BR-REC-15 Pull-ups never recorded is due on the join date: Overdue 124 days", () => {
    const s = pick(run({ last: { f2: null } }), "ft");
    expect(s.state).toBe("overdue");
    expect(s.nextDueOn).toBe(JOINED);
    expect(s.daysOverdue).toBe(124);
    expect(ids(s.dueItems)).toEqual(["f2"]);
    // the rest of the fitness test has values, so this is not "never recorded" as a whole
    expect(s.neverRecorded).toBe(false);
  });

  test("Case 5 BR-REC-94 weight last 2026-01-31 is due 28 Feb (the day does not exist in February)", () => {
    const s = pick(run({ last: { weight: "2026-01-31" } }), "bc");
    expect(s.nextDueOn).toBe("2026-02-28");
    expect(s.state).toBe("overdue");
    expect(ids(s.dueItems)).toEqual(["weight"]);
  });

  test("Case 6 BR-REC-94 a 2-week item last 2026-09-20 is due 4 Oct: Due soon, due tomorrow", () => {
    const s = pick(run({ last: { sleep: "2026-09-20" } }), "wk");
    expect(s.nextDueOn).toBe("2026-10-04");
    expect(s.state).toBe("upcoming");
    expect(s.daysOverdue).toBe(-1);
    expect(ids(s.dueItems)).toEqual(["sleep"]);
  });

  test("Case 7 BR-REC-96 weight last 2026-09-03 is due 3 Oct: Due soon, due today (0 days)", () => {
    const s = pick(run({ last: { weight: "2026-09-03" } }), "bc");
    expect(s.nextDueOn).toBe("2026-10-03");
    expect(s.state).toBe("upcoming");
    expect(s.daysOverdue).toBe(0);
    expect(ids(s.dueItems)).toEqual(["weight"]);
  });

  test("Case 8 BR-REC-16 Weight due 30 Sep and Body fat due 8 Oct make one row: Overdue 3 days, chips Weight and Body fat", () => {
    const statuses = run({
      last: { weight: "2026-08-30", bodyfat: "2026-09-08" },
    });
    const s = pick(statuses, "bc");
    expect(s.state).toBe("overdue");
    expect(s.nextDueOn).toBe("2026-09-30");
    expect(s.daysOverdue).toBe(3);
    expect(ids(s.dueItems)).toEqual(["weight", "bodyfat"]);
    const rows = dueListRows(statuses, "overdue").filter(
      (r) => r.typeId === "bc",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.daysOverdue).toBe(3);
    expect(rows[0]?.items.map((i) => i.name)).toEqual(["Weight", "Body fat"]);
    // one row per member per type: not a second one in the other tab
    expect(
      dueListRows(statuses, "upcoming").filter((r) => r.typeId === "bc"),
    ).toHaveLength(0);
  });

  test("Case 9 BR-REC-16 five body composition items due, three saved today: the row stays with two chips", () => {
    const statuses = run({
      lastMeasured: [
        { memberId: MEMBER, metricId: "weight", measuredOn: "2026-10-03" },
        { memberId: MEMBER, metricId: "bodyfat", measuredOn: "2026-10-03" },
        { memberId: MEMBER, metricId: "muscle", measuredOn: "2026-10-03" },
      ],
      types: [bodyComposition()],
    });
    const s = pick(statuses, "bc");
    expect(s.state).toBe("overdue");
    expect(ids(s.dueItems)).toEqual(["water", "bodyage"]);
    const rows = dueListRows(statuses, "overdue");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.items).toHaveLength(2);
  });

  test("Case 9 BR-REC-16 a type is done when every due measurement has a value: nothing is left, no row", () => {
    const statuses = run({ types: [bodyComposition()] });
    const s = pick(statuses, "bc");
    expect(s.state).toBe("ok");
    expect(s.dueItems).toEqual([]);
    expect(dueListRows(statuses, "overdue")).toEqual([]);
    expect(dueListRows(statuses, "upcoming")).toEqual([]);
  });

  test("Case 14 BR-REC-95 a turned-off Body age that was never recorded is never a chip", () => {
    const statuses = run({
      types: [bodyComposition({ bodyAgeOn: false })],
      last: { weight: "2026-08-01", bodyage: null },
    });
    const s = pick(statuses, "bc");
    expect(ids(s.dueItems)).not.toContain("bodyage");
    expect(ids(s.allItems)).not.toContain("bodyage");
    // and it does not make a fully recorded assessment due
    const quiet = pick(
      run({
        types: [bodyComposition({ bodyAgeOn: false })],
        last: { bodyage: null },
      }),
      "bc",
    );
    expect(quiet.state).toBe("ok");
    expect(quiet.dueItems).toEqual([]);
  });
});

describe("BR-REC-105 days overdue counts calendar days", () => {
  test("BR-REC-105 due 1 Oct, today 3 Oct is 2 days overdue", () => {
    const s = pick(run({ last: { weight: "2026-09-01" } }), "bc");
    expect(s.nextDueOn).toBe("2026-10-01");
    expect(s.daysOverdue).toBe(2);
  });

  test("BR-REC-105 due yesterday is 1 day overdue; due today is 0; due tomorrow is -1", () => {
    const yesterday = pick(run({ last: { weight: "2026-09-02" } }), "bc");
    const today = pick(run({ last: { weight: "2026-09-03" } }), "bc");
    const tomorrow = pick(run({ last: { weight: "2026-09-04" } }), "bc");
    expect([
      yesterday.daysOverdue,
      today.daysOverdue,
      tomorrow.daysOverdue,
    ]).toEqual([1, 0, -1]);
  });

  test("BR-REC-105 days count across a month end and a year end", () => {
    const s = pick(
      run({ last: { weight: "2025-11-30" }, today: "2026-01-03" }),
      "bc",
    );
    // 2025-11-30 + 1 month = 2025-12-30; 2026-01-03 is 4 days later
    expect(s.nextDueOn).toBe("2025-12-30");
    expect(s.daysOverdue).toBe(4);
  });
});

describe("BR-REC-93 'today' is an argument; the maths use dates only", () => {
  test("BR-REC-93 the same data gives another answer for another today", () => {
    const last = { weight: "2026-09-10" }; // due 10 Oct
    const early = pick(run({ last, today: "2026-10-02" }), "bc"); // 8 days ahead, outside 7
    const edge = pick(run({ last, today: "2026-10-03" }), "bc"); // 7 days ahead
    const late = pick(run({ last, today: "2026-10-11" }), "bc"); // 1 day past
    expect(early.state).toBe("ok");
    expect(early.dueItems).toEqual([]);
    expect(edge.state).toBe("upcoming");
    expect(late.state).toBe("overdue");
    expect(late.daysOverdue).toBe(1);
  });
});

describe("BR-REC-94 months land on the month's last day, weeks add 7 days each", () => {
  const cases: [string, number, "week" | "month", string][] = [
    ["2026-01-31", 1, "month", "2026-02-28"],
    ["2028-01-31", 1, "month", "2028-02-29"],
    ["2026-03-31", 1, "month", "2026-04-30"],
    ["2026-08-31", 1, "month", "2026-09-30"],
    ["2026-10-31", 4, "month", "2027-02-28"],
    ["2026-11-30", 3, "month", "2027-02-28"],
    ["2026-12-15", 1, "month", "2027-01-15"],
    ["2026-10-15", 24, "month", "2028-10-15"],
    ["2026-09-20", 2, "week", "2026-10-04"],
    ["2026-12-25", 1, "week", "2027-01-01"],
    ["2026-02-25", 1, "week", "2026-03-04"],
    ["2028-02-25", 1, "week", "2028-03-03"],
    ["2026-01-01", 12, "week", "2026-03-26"],
    // four weeks is 28 days, not one calendar month
    ["2026-01-01", 4, "week", "2026-01-29"],
  ];
  for (const [last, count, unit, due] of cases) {
    test(`BR-REC-94 last ${last} + ${count} ${unit}${count === 1 ? "" : "s"} is due ${due}`, () => {
      const type: DueAssessmentType = {
        id: "t",
        name: "T",
        isActive: true,
        sortOrder: 1,
        intervalCount: count,
        intervalUnit: unit,
        measurements: [metric("x", "X", 1)],
      };
      const s = pick(run({ types: [type], last: { x: last } }), "t");
      expect(s.nextDueOn).toBe(due);
    });
  }
});

describe("C1 each measurement has its own due date and interval (BR-REC-14, 15)", () => {
  function one(
    own: Partial<DueMeasurement>,
    last: string | null = "2026-08-10",
  ) {
    const type: DueAssessmentType = {
      id: "t",
      name: "T",
      isActive: true,
      sortOrder: 1,
      intervalCount: 2,
      intervalUnit: "month",
      measurements: [metric("x", "X", 1, own)],
    };
    return pick(run({ types: [type], last: { x: last } }), "t");
  }

  test("C1 without its own repeat a measurement uses the assessment's (2 months: 10 Aug -> 10 Oct)", () => {
    expect(one({}).nextDueOn).toBe("2026-10-10");
  });

  test("C1 its own repeat wins over the assessment's (3 months: 10 Aug -> 10 Nov)", () => {
    expect(one({ intervalCount: 3, intervalUnit: "month" }).nextDueOn).toBe(
      "2026-11-10",
    );
  });

  test("C1 its own repeat may use another unit than the assessment's (1 week: 10 Aug -> 17 Aug)", () => {
    expect(one({ intervalCount: 1, intervalUnit: "week" }).nextDueOn).toBe(
      "2026-08-17",
    );
  });

  test("C1 a count without a unit counts as no own repeat of its own", () => {
    expect(one({ intervalCount: 3, intervalUnit: null }).nextDueOn).toBe(
      "2026-10-10",
    );
  });

  test("C1 a unit without a count counts as no own repeat of its own", () => {
    expect(one({ intervalCount: null, intervalUnit: "week" }).nextDueOn).toBe(
      "2026-10-10",
    );
  });

  test("C1 never recorded: due on the join date, no repeat added", () => {
    const s = one({ intervalCount: 3, intervalUnit: "month" }, null);
    expect(s.nextDueOn).toBe(JOINED);
    expect(s.daysOverdue).toBe(124);
  });

  test("C1 a measurement is due by its own last value, not by the assessment's latest save", () => {
    // Weight was measured 10 Sep, Body fat only on 1 Aug: Body fat is the one that is due
    const s = pick(
      run({
        last: { weight: "2026-09-10", bodyfat: "2026-08-01" },
        types: [bodyComposition()],
      }),
      "bc",
    );
    expect(s.nextDueOn).toBe("2026-09-01");
    // Weight (due 10 Oct) is inside the 7-day window too; setup order puts Weight first
    expect(ids(s.dueItems)).toEqual(["weight", "bodyfat"]);
  });

  test("C1 the latest value day wins over older rows of the same measurement, in any order", () => {
    const s = pick(
      run({
        types: [bodyComposition()],
        lastMeasured: [
          { memberId: MEMBER, metricId: "weight", measuredOn: "2026-06-01" },
          { memberId: MEMBER, metricId: "weight", measuredOn: "2026-09-10" },
          { memberId: MEMBER, metricId: "weight", measuredOn: "2026-07-15" },
          ...["bodyfat", "muscle", "water", "bodyage"].map((metricId) => ({
            memberId: MEMBER,
            metricId,
            measuredOn: TODAY,
          })),
        ],
      }),
      "bc",
    );
    expect(s.nextDueOn).toBe("2026-10-10");
    expect(s.state).toBe("upcoming");
    expect(ids(s.dueItems)).toEqual(["weight"]);
  });

  test("C1 a row for an unknown member or an unknown measurement is ignored", () => {
    const base = run({
      last: { weight: "2026-09-10" },
      types: [bodyComposition()],
    });
    const withGhosts = run({
      types: [bodyComposition()],
      lastMeasured: [
        { memberId: MEMBER, metricId: "weight", measuredOn: "2026-09-10" },
        ...["bodyfat", "muscle", "water", "bodyage"].map((metricId) => ({
          memberId: MEMBER,
          metricId,
          measuredOn: TODAY,
        })),
        { memberId: "ghost", metricId: "weight", measuredOn: "2020-01-01" },
        { memberId: MEMBER, metricId: "ghost", measuredOn: "2020-01-01" },
      ],
    });
    expect(withGhosts).toEqual(base);
  });

  test("C1 members are worked out one by one", () => {
    const members: DueMember[] = [
      { id: "a", fullName: "Anita Rao", joinedOn: JOINED },
      { id: "b", fullName: "Bala K", joinedOn: "2026-09-25" },
    ];
    const statuses = run({
      types: [bodyComposition()],
      members,
      lastMeasured: [
        // Anita recorded everything today, Bala has nothing: due on his join date
        ...["weight", "bodyfat", "muscle", "water", "bodyage"].map(
          (metricId) => ({
            memberId: "a",
            metricId,
            measuredOn: TODAY,
          }),
        ),
      ],
    });
    expect(pick(statuses, "bc", "a").state).toBe("ok");
    const bala = pick(statuses, "bc", "b");
    expect(bala.state).toBe("overdue");
    expect(bala.nextDueOn).toBe("2026-09-25");
    expect(bala.daysOverdue).toBe(8);
    expect(ids(bala.dueItems)).toEqual([
      "weight",
      "bodyfat",
      "muscle",
      "water",
      "bodyage",
    ]);
    expect(bala.neverRecorded).toBe(true);
  });
});

describe("BR-REC-95 only turned-on assessments and measurements are ever due; what gets a status (C1)", () => {
  test("BR-REC-95 a turned-off assessment has no status at all", () => {
    const off: DueAssessmentType = { ...fitnessTest(), isActive: false };
    const statuses = run({
      types: [bodyComposition(), off],
      last: { f1: null },
    });
    expect(statuses.map((s) => s.typeId)).toEqual(["bc"]);
  });

  test("BR-REC-95 a turned-off assessment stays out even when it is flagged", () => {
    const off: DueAssessmentType = { ...fitnessTest(), isActive: false };
    const statuses = run({
      types: [off],
      overrides: [
        {
          memberId: MEMBER,
          typeId: "ft",
          kind: "flag",
          setOn: "2026-10-01",
          untilOn: null,
          latestAssessedOnSinceSet: null,
        },
      ],
    });
    expect(statuses).toEqual([]);
    expect(dueListRows(statuses, "overdue")).toEqual([]);
  });

  test("BR-REC-95 turning an assessment off hides its measurements, although each is still turned on itself", () => {
    const off: DueAssessmentType = { ...bodyComposition(), isActive: false };
    expect(run({ types: [off], last: { weight: null } })).toEqual([]);
  });

  test("C1 an assessment whose measurements are all turned off has no status", () => {
    const type: DueAssessmentType = {
      ...bodyComposition(),
      measurements: bodyComposition().measurements.map((m) => ({
        ...m,
        isActive: false,
      })),
    };
    expect(run({ types: [type], last: { weight: null } })).toEqual([]);
  });

  test("C1 an assessment without any measurement has no status", () => {
    const type: DueAssessmentType = { ...bodyComposition(), measurements: [] };
    expect(run({ types: [type] })).toEqual([]);
  });

  test("C1 the value of a turned-off measurement does not count towards neverRecorded", () => {
    const statuses = run({
      types: [bodyComposition()],
      lastMeasured: [
        // only the Body age value exists...
        { memberId: MEMBER, metricId: "bodyage", measuredOn: "2026-09-20" },
      ],
    });
    // ...and Body age is turned on here, so it is a value
    expect(pick(statuses, "bc").neverRecorded).toBe(false);

    const bodyAgeOff = run({
      types: [bodyComposition({ bodyAgeOn: false })],
      lastMeasured: [
        { memberId: MEMBER, metricId: "bodyage", measuredOn: "2026-09-20" },
      ],
    });
    expect(pick(bodyAgeOff, "bc").neverRecorded).toBe(true);
  });

  test("C10 neverRecorded: none of the turned-on measurements has a value", () => {
    const s = pick(
      run({
        types: [bodyComposition()],
        lastMeasured: [],
      }),
      "bc",
    );
    expect(s.neverRecorded).toBe(true);
    expect(s.state).toBe("overdue");
    expect(s.nextDueOn).toBe(JOINED);
  });

  test("C10 neverRecorded is false as soon as one turned-on measurement has a value", () => {
    const s = pick(
      run({
        types: [bodyComposition()],
        lastMeasured: [
          { memberId: MEMBER, metricId: "water", measuredOn: "2026-05-01" },
        ],
      }),
      "bc",
    );
    expect(s.neverRecorded).toBe(false);
  });
});

describe("C2 the row's measurements, the Due soon window and the state (BR-REC-16, 96)", () => {
  function windowFor(lead: number, offsetDays: number) {
    // weekly item due `offsetDays` after TODAY: last = due - 7 days
    const due = new Date(Date.UTC(2026, 9, 3 + offsetDays))
      .toISOString()
      .slice(0, 10);
    const last = new Date(Date.UTC(2026, 9, 3 + offsetDays - 7))
      .toISOString()
      .slice(0, 10);
    const type: DueAssessmentType = {
      id: "t",
      name: "T",
      isActive: true,
      sortOrder: 1,
      intervalCount: 1,
      intervalUnit: "week",
      measurements: [metric("x", "X", 1)],
    };
    return {
      due,
      s: pick(run({ types: [type], last: { x: last }, lead }), "t"),
    };
  }

  for (const [lead, offset, state] of [
    [7, 7, "upcoming"],
    [7, 8, "ok"],
    [7, 0, "upcoming"],
    [7, -1, "overdue"],
    [0, 0, "upcoming"],
    [0, 1, "ok"],
    [0, -1, "overdue"],
    [30, 30, "upcoming"],
    [30, 31, "ok"],
    [3, 3, "upcoming"],
    [3, 4, "ok"],
  ] as const) {
    test(`BR-REC-96 Due soon ${lead} days, due ${offset >= 0 ? `in ${offset}` : `${-offset} ago`} days -> ${state}`, () => {
      const { due, s } = windowFor(lead, offset);
      expect(s.nextDueOn).toBe(due);
      expect(s.state).toBe(state);
      expect(s.dueItems.length).toBe(state === "ok" ? 0 : 1);
    });
  }

  test("BR-REC-96 the row holds every measurement due within the window, overdue ones included, in setup order", () => {
    // sortOrder 1..5 = weight, bodyfat, muscle, water, bodyage; supplied in a scrambled order
    const type = bodyComposition();
    type.measurements = [
      type.measurements[3] as DueMeasurement,
      type.measurements[0] as DueMeasurement,
      type.measurements[4] as DueMeasurement,
      type.measurements[2] as DueMeasurement,
      type.measurements[1] as DueMeasurement,
    ];
    const s = pick(
      run({
        types: [type],
        last: {
          weight: "2026-08-20", // due 20 Sep (overdue)
          bodyfat: "2026-09-08", // due 8 Oct (inside the window)
          muscle: "2026-09-12", // due 12 Oct (10 days away, outside)
          water: "2026-09-03", // due 3 Oct (today)
          bodyage: "2026-09-15", // due 15 Oct, outside
        },
      }),
      "bc",
    );
    expect(ids(s.dueItems)).toEqual(["weight", "bodyfat", "water"]);
    expect(s.nextDueOn).toBe("2026-09-20");
    expect(s.state).toBe("overdue");
    // allItems holds every turned-on measurement in setup order
    expect(ids(s.allItems)).toEqual([
      "weight",
      "bodyfat",
      "muscle",
      "water",
      "bodyage",
    ]);
  });

  test("C2 an item is {metricId, name}: the measurement's id and name", () => {
    const s = pick(run({ last: { weight: "2026-08-01" } }), "bc");
    expect(s.dueItems[0]).toEqual({ metricId: "weight", name: "Weight" });
  });

  test("C2 nextDueOn is the earliest due date of ALL turned-on measurements, also when none is due", () => {
    const s = pick(
      run({
        types: [bodyComposition()],
        last: {
          weight: "2026-10-03", // due 3 Nov
          bodyfat: "2026-09-20", // due 20 Oct: 17 days away, outside the window, but the earliest
          muscle: "2026-10-03",
          water: "2026-10-03",
          bodyage: "2026-10-03",
        },
      }),
      "bc",
    );
    expect(s.state).toBe("ok");
    expect(s.nextDueOn).toBe("2026-10-20");
    expect(s.daysOverdue).toBe(-17);
    expect(s.dueItems).toEqual([]);
  });

  test("C2 the status carries the member and assessment names", () => {
    const s = pick(run({ last: { weight: "2026-08-01" } }), "bc");
    expect(s.memberId).toBe(MEMBER);
    expect(s.fullName).toBe("Surya Pratap");
    expect(s.typeName).toBe("Body composition");
    expect(s.typeSortOrder).toBe(1);
  });
});

describe("Which statuses come back, and in what order (C1)", () => {
  test("members in input order, then assessments by sortOrder, whatever order they were given", () => {
    const members: DueMember[] = [
      { id: "b", fullName: "Bala K", joinedOn: JOINED },
      { id: "a", fullName: "Anita Rao", joinedOn: JOINED },
    ];
    const statuses = run({
      members,
      types: [weeklyCheck(), fitnessTest(), bodyComposition()],
    });
    expect(statuses.map((s) => `${s.memberId}/${s.typeId}`)).toEqual([
      "b/bc",
      "b/ft",
      "b/wk",
      "a/bc",
      "a/ft",
      "a/wk",
    ]);
  });

  test("assessments with the same sortOrder keep their input order", () => {
    const first: DueAssessmentType = {
      ...bodyComposition(),
      id: "first",
      sortOrder: 5,
    };
    const second: DueAssessmentType = {
      ...fitnessTest(),
      id: "second",
      sortOrder: 5,
    };
    expect(run({ types: [first, second] }).map((s) => s.typeId)).toEqual([
      "first",
      "second",
    ]);
    expect(run({ types: [second, first] }).map((s) => s.typeId)).toEqual([
      "second",
      "first",
    ]);
  });

  test("no members, or no assessments, gives an empty answer", () => {
    expect(run({ members: [], lastMeasured: [] })).toEqual([]);
    expect(run({ types: [] })).toEqual([]);
  });
});

describe("Assess soon and Remind me later in the engine (BR-REC-18, 98, 99; C4, C6, C7, C10)", () => {
  const flag = (extra: Partial<DueOverride> = {}): DueOverride => ({
    memberId: MEMBER,
    typeId: "ft",
    kind: "flag",
    setOn: "2026-10-01",
    untilOn: null,
    latestAssessedOnSinceSet: null,
    ...extra,
  });
  const snooze = (extra: Partial<DueOverride> = {}): DueOverride => ({
    memberId: MEMBER,
    typeId: "bc",
    kind: "snooze",
    setOn: "2026-10-03",
    untilOn: "2026-10-20",
    latestAssessedOnSinceSet: null,
    ...extra,
  });

  test("Case 12 BR-REC-98 Assess soon with nothing due: flagged, every turned-on fitness item", () => {
    const statuses = run({ overrides: [flag()] });
    const s = pick(statuses, "ft");
    expect(s.flagged).toBe(true);
    expect(s.snoozedUntil).toBeNull();
    expect(s.allItems).toHaveLength(14);
    expect(ids(s.allItems)).toEqual(FITNESS_NAMES.map((_, i) => `f${i + 1}`));
    // dates only: the row itself is not due
    expect(s.state).toBe("ok");
    expect(s.dueItems).toEqual([]);
  });

  test("Case 12 BR-REC-98 the flagged row is in Overdue (never Due soon) with all 14 chips", () => {
    const statuses = run({ overrides: [flag()] });
    const rows = dueListRows(statuses, "overdue").filter(
      (r) => r.typeId === "ft",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.flagged).toBe(true);
    expect(rows[0]?.items).toHaveLength(14);
    expect(
      dueListRows(statuses, "upcoming").filter((r) => r.typeId === "ft"),
    ).toEqual([]);
  });

  test("BR-REC-18 Assess soon puts the row in Overdue regardless of date, even when it is due later", () => {
    // Fran due 10 Nov and everything else done today: due in the far future
    const statuses = run({ overrides: [flag()], last: { f3: "2026-08-10" } });
    const row = dueListRows(statuses, "overdue").find((r) => r.typeId === "ft");
    expect(row?.flagged).toBe(true);
    expect(row?.dueOn).toBe("2026-11-10");
    expect(row?.daysOverdue).toBe(-38);
  });

  test("C4 a flagged row that is also due is in Overdue only, with every item, not just the due ones", () => {
    const statuses = run({ overrides: [flag()], last: { f2: "2026-01-01" } });
    expect(pick(statuses, "ft").state).toBe("overdue");
    const row = dueListRows(statuses, "overdue").find((r) => r.typeId === "ft");
    expect(row?.items).toHaveLength(14);
    expect(
      dueListRows(statuses, "upcoming").some((r) => r.typeId === "ft"),
    ).toBe(false);
  });

  test("C4 a flagged row that is only due soon is in Overdue, not in Due soon", () => {
    const statuses = run({ overrides: [flag()], last: { f2: "2026-08-08" } }); // due 8 Oct
    expect(pick(statuses, "ft").state).toBe("upcoming");
    expect(
      dueListRows(statuses, "upcoming").some((r) => r.typeId === "ft"),
    ).toBe(false);
    expect(
      dueListRows(statuses, "overdue").some((r) => r.typeId === "ft"),
    ).toBe(true);
  });

  test("Case 15 BR-REC-98 Assess soon set 1 Oct, fitness test saved dated 15 Sep: still Assess soon", () => {
    const statuses = run({
      overrides: [flag({ latestAssessedOnSinceSet: "2026-09-15" })],
    });
    expect(pick(statuses, "ft").flagged).toBe(true);
    expect(
      dueListRows(statuses, "overdue").find((r) => r.typeId === "ft")?.flagged,
    ).toBe(true);
  });

  for (const [saved, ended] of [
    [null, false],
    ["2026-09-30", false],
    ["2026-10-01", true],
    ["2026-10-02", true],
    ["2026-10-03", true],
  ] as const) {
    test(`BR-REC-98 C6 Assess soon set 1 Oct, latest save since then dated ${saved ?? "(none)"}: ${ended ? "ended" : "still on"}`, () => {
      const s = pick(
        run({ overrides: [flag({ latestAssessedOnSinceSet: saved })] }),
        "ft",
      );
      expect(s.flagged).toBe(!ended);
    });
  }

  test("BR-REC-98 an ended Assess soon leaves the normal row: back to dates only", () => {
    const statuses = run({
      overrides: [flag({ latestAssessedOnSinceSet: "2026-10-02" })],
    });
    expect(
      dueListRows(statuses, "overdue").some((r) => r.typeId === "ft"),
    ).toBe(false);
    expect(
      dueListRows(statuses, "upcoming").some((r) => r.typeId === "ft"),
    ).toBe(false);
  });

  test("Case 13 BR-REC-99 a reminder until 20 Oct hides the row (both tabs) until that day, then it is back", () => {
    const due = { last: { weight: "2026-08-01" } }; // Weight due 1 Sep: overdue
    for (const today of ["2026-10-03", "2026-10-19"]) {
      const statuses = run({ ...due, today, overrides: [snooze()] });
      const s = pick(statuses, "bc");
      expect(s.snoozedUntil).toBe("2026-10-20");
      expect(s.flagged).toBe(false);
      expect(
        dueListRows(statuses, "overdue").some((r) => r.typeId === "bc"),
      ).toBe(false);
      expect(
        dueListRows(statuses, "upcoming").some((r) => r.typeId === "bc"),
      ).toBe(false);
    }
    for (const today of ["2026-10-20", "2026-10-21"]) {
      const statuses = run({ ...due, today, overrides: [snooze()] });
      const s = pick(statuses, "bc");
      expect(s.snoozedUntil).toBeNull();
      expect(
        dueListRows(statuses, "overdue").some((r) => r.typeId === "bc"),
      ).toBe(true);
    }
  });

  test("BR-REC-99 a reminder never changes the dates: state, nextDueOn, daysOverdue and dueItems are the same as without it", () => {
    const due = { last: { weight: "2026-08-01", bodyfat: "2026-09-08" } };
    const plain = pick(run(due), "bc");
    const withReminder = pick(run({ ...due, overrides: [snooze()] }), "bc");
    expect(withReminder.state).toBe(plain.state);
    expect(withReminder.nextDueOn).toBe(plain.nextDueOn);
    expect(withReminder.daysOverdue).toBe(plain.daysOverdue);
    expect(withReminder.dueItems).toEqual(plain.dueItems);
    expect(withReminder.allItems).toEqual(plain.allItems);
    expect(withReminder.neverRecorded).toBe(plain.neverRecorded);
  });

  test("BR-REC-98 Assess soon never changes the dates either (state, nextDueOn, daysOverdue, dueItems)", () => {
    const due = { last: { f2: "2026-08-01" } };
    const plain = pick(run(due), "ft");
    const flagged = pick(run({ ...due, overrides: [flag()] }), "ft");
    expect(flagged.state).toBe(plain.state);
    expect(flagged.nextDueOn).toBe(plain.nextDueOn);
    expect(flagged.daysOverdue).toBe(plain.daysOverdue);
    expect(flagged.dueItems).toEqual(plain.dueItems);
  });

  for (const [saved, ended] of [
    [null, false],
    ["2026-09-30", false],
    ["2026-10-03", true],
    ["2026-10-10", true],
  ] as const) {
    test(`BR-REC-99 C6 reminder set 3 Oct, latest save since then dated ${saved ?? "(none)"}: ${ended ? "ended" : "still on"}`, () => {
      const s = pick(
        run({ overrides: [snooze({ latestAssessedOnSinceSet: saved })] }),
        "bc",
      );
      expect(s.snoozedUntil).toBe(ended ? null : "2026-10-20");
    });
  }

  test("C7 a reminder is on while today < until: a reminder until yesterday or today is already over", () => {
    for (const [until, on] of [
      ["2026-10-02", null],
      ["2026-10-03", null],
      ["2026-10-04", "2026-10-04"],
    ] as const) {
      const s = pick(
        run({ overrides: [snooze({ untilOn: until, setOn: "2026-09-25" })] }),
        "bc",
      );
      expect(s.snoozedUntil).toBe(on);
    }
  });

  test("C6 a reminder without an until day is ignored", () => {
    const s = pick(run({ overrides: [snooze({ untilOn: null })] }), "bc");
    expect(s.snoozedUntil).toBeNull();
    expect(s.flagged).toBe(false);
  });

  test("an override only touches its own member and assessment", () => {
    const members: DueMember[] = [
      { id: MEMBER, fullName: "Surya Pratap", joinedOn: JOINED },
      { id: "other", fullName: "Anita Rao", joinedOn: JOINED },
    ];
    const statuses = run({ members, overrides: [flag()] });
    expect(pick(statuses, "ft", MEMBER).flagged).toBe(true);
    expect(pick(statuses, "ft", "other").flagged).toBe(false);
    expect(pick(statuses, "bc", MEMBER).flagged).toBe(false);
    expect(pick(statuses, "wk", MEMBER).flagged).toBe(false);
  });

  test("an override of an unknown member or assessment is ignored", () => {
    const base = run();
    const withGhosts = run({
      overrides: [
        flag({ memberId: "ghost" }),
        flag({ typeId: "ghost" }),
        snooze({ memberId: "ghost" }),
      ],
    });
    expect(withGhosts).toEqual(base);
  });

  test("a snoozed row shows the reminder day, not a flag; a flagged row shows no reminder", () => {
    const s = run({
      overrides: [flag(), snooze()],
      last: { weight: "2026-08-01" },
    });
    expect(pick(s, "ft").flagged).toBe(true);
    expect(pick(s, "ft").snoozedUntil).toBeNull();
    expect(pick(s, "bc").flagged).toBe(false);
    expect(pick(s, "bc").snoozedUntil).toBe("2026-10-20");
  });
});
