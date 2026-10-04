import { describe, expect, test } from "bun:test";

import { reportCard } from "../../../src/lib/domain/report";
import { reportCardSchema } from "../../../src/types/progress.types";

// BR-REC-22 (header + per metric first / latest / best / change), BR-REC-106 (sections in setup
// order, never-recorded left out, turned-off with readings stay), BR-REC-108 (segmental table)
// and the build clarifications P2 / P3 of the progress spec. `reportCard` is a pure function of
// the whole catalog and one member's values: no database, no clock.

type Input = Parameters<typeof reportCard>[0];
type CatalogMetric = Input["types"][number]["metrics"][number];
type Value = Input["values"][number];

const id = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function metric(n: number, over: Partial<CatalogMetric> = {}): CatalogMetric {
  return {
    id: id(n),
    name: `Metric ${n}`,
    unit: "kg",
    datatype: "number",
    decimals: 1,
    better: "lower",
    sortOrder: n,
    isActive: true,
    tableGroup: null,
    tablePart: null,
    ...over,
  };
}

function catalogType(
  n: number,
  name: string,
  metrics: CatalogMetric[],
  sortOrder = n,
): Input["types"][number] {
  return { id: id(1000 + n), name, sortOrder, metrics };
}

function val(
  typeN: number,
  assessmentN: number,
  m: CatalogMetric,
  on: string,
  value: number,
  isEstimated = false,
): Value {
  return {
    assessmentId: id(2000 + assessmentN),
    typeId: id(1000 + typeN),
    metricId: m.id,
    on,
    isEstimated,
    value,
  };
}

const BASE: Omit<Input, "types" | "values"> = {
  gymName: "Fionis CrossFit",
  today: "2026-10-03",
  member: {
    fullName: "Surya Pratap",
    dateOfBirth: "1982-05-10",
    sex: "male",
    joinedOn: "2025-06-01",
  },
  membership: { plan: "annual", status: "active" },
};

const build = (types: Input["types"], values: Input["values"]) =>
  reportCard({ ...BASE, types, values });

const rd = (value: number, on: string, isEstimated = false) => ({
  value,
  on,
  isEstimated,
});

describe("BR-REC-22 / 106 the card header", () => {
  test("BR-REC-106 gym name, printed date, name, age, sex, plan, status and join date", () => {
    const card = build([], []);
    expect(card.gymName).toBe("Fionis CrossFit");
    expect(card.printedOn).toBe("2026-10-03");
    expect(card.member).toEqual({
      fullName: "Surya Pratap",
      age: 44,
      sex: "male",
      plan: "annual",
      membershipStatus: "active",
      joinedOn: "2025-06-01",
    });
  });

  test("BR-REC-106 the plan and status come from the membership given (ends soon, quarterly)", () => {
    const card = reportCard({
      ...BASE,
      membership: { plan: "quarterly", status: "expiring" },
      types: [],
      values: [],
    });
    expect(card.member.plan).toBe("quarterly");
    expect(card.member.membershipStatus).toBe("expiring");
  });

  test("BR-REC-106 an ended membership is shown as ended", () => {
    const card = reportCard({
      ...BASE,
      membership: { plan: "monthly", status: "expired" },
      types: [],
      values: [],
    });
    expect(card.member.plan).toBe("monthly");
    expect(card.member.membershipStatus).toBe("expired");
  });

  test("BR-REC-106 age is by the printed date: the day before and on the birthday", () => {
    // born 1982-05-10
    expect(
      reportCard({ ...BASE, today: "2026-05-09", types: [], values: [] }).member
        .age,
    ).toBe(43);
    expect(
      reportCard({ ...BASE, today: "2026-05-10", types: [], values: [] }).member
        .age,
    ).toBe(44);
  });

  test("BR-REC-106 a member with no readings gets a card with no sections and no table", () => {
    const weight = metric(1);
    const card = build([catalogType(1, "Body composition", [weight])], []);
    expect(card.types).toEqual([]);
    expect(card.segmental).toBeNull();
  });

  test("BR-REC-106 the card satisfies the E35 schema", () => {
    const weight = metric(1, { name: "Weight" });
    const card = build(
      [catalogType(1, "Body composition", [weight])],
      [
        val(1, 1, weight, "2025-06-01", 98),
        val(1, 2, weight, "2026-10-03", 94),
      ],
    );
    expect(reportCardSchema.safeParse(card).success).toBe(true);
  });
});

describe("BR-REC-22 / 106 the sections and their rows", () => {
  const weight = metric(1, { name: "Weight", unit: "kg", better: "lower" });
  const height = metric(2, {
    name: "Height",
    unit: "cm",
    better: "none",
    sortOrder: 2,
  });
  const fran = metric(3, {
    name: "Fran",
    unit: "",
    datatype: "duration",
    decimals: 0,
    better: "lower",
  });

  test("BR-REC-22 Surya's S12 sketch: weight 98 -> 94, height 172 -> 172.5, Fran 5:20 -> 4:10", () => {
    const card = build(
      [
        catalogType(1, "Body composition", [weight, height]),
        catalogType(2, "Fitness test", [fran]),
      ],
      [
        val(1, 1, weight, "2025-06-01", 98),
        val(1, 1, height, "2025-06-01", 172),
        val(1, 2, weight, "2026-10-03", 94),
        val(1, 2, height, "2026-10-03", 172.5),
        val(2, 3, fran, "2026-01-10", 320),
        val(2, 4, fran, "2026-10-03", 250),
      ],
    );
    expect(card.types).toEqual([
      {
        id: id(1001),
        name: "Body composition",
        metrics: [
          {
            id: id(1),
            name: "Weight",
            unit: "kg",
            datatype: "number",
            decimals: 1,
            better: "lower",
            first: rd(98, "2025-06-01"),
            latest: rd(94, "2026-10-03"),
            best: rd(94, "2026-10-03"),
            change: -4,
            readings: 2,
            points: [rd(98, "2025-06-01"), rd(94, "2026-10-03")],
          },
          {
            id: id(2),
            name: "Height",
            unit: "cm",
            datatype: "number",
            decimals: 1,
            better: "none",
            first: rd(172, "2025-06-01"),
            latest: rd(172.5, "2026-10-03"),
            best: null,
            change: 0.5,
            readings: 2,
            points: [rd(172, "2025-06-01"), rd(172.5, "2026-10-03")],
          },
        ],
      },
      {
        id: id(1002),
        name: "Fitness test",
        metrics: [
          {
            id: id(3),
            name: "Fran",
            unit: "",
            datatype: "duration",
            decimals: 0,
            better: "lower",
            first: rd(320, "2026-01-10"),
            latest: rd(250, "2026-10-03"),
            best: rd(250, "2026-10-03"),
            change: -70,
            readings: 2,
            points: [rd(320, "2026-01-10"), rd(250, "2026-10-03")],
          },
        ],
      },
    ]);
    expect(card.segmental).toBeNull();
  });

  test("BR-REC-22 under 2 readings: the value only (change null, one point)", () => {
    const pullUps = metric(4, {
      name: "Pull-ups",
      unit: "reps",
      decimals: 0,
      better: "higher",
    });
    const card = build(
      [catalogType(2, "Fitness test", [pullUps])],
      [val(2, 1, pullUps, "2026-10-03", 3)],
    );
    const row = card.types[0]?.metrics[0];
    expect(row?.readings).toBe(1);
    expect(row?.change).toBeNull();
    expect(row?.first).toEqual(rd(3, "2026-10-03"));
    expect(row?.latest).toEqual(rd(3, "2026-10-03"));
    expect(row?.points).toEqual([rd(3, "2026-10-03")]);
  });

  test("BR-REC-107 Deadlift 100 (Jan), 100 (Mar): best 100 on the January date", () => {
    const deadlift = metric(5, {
      name: "Deadlift",
      unit: "kg",
      decimals: 0,
      better: "higher",
    });
    const card = build(
      [catalogType(2, "Fitness test", [deadlift])],
      [
        val(2, 1, deadlift, "2026-03-10", 100),
        val(2, 2, deadlift, "2026-01-10", 100),
      ],
    );
    expect(card.types[0]?.metrics[0]?.best).toEqual(rd(100, "2026-01-10"));
  });

  test("BR-REC-107 'No direction' shows no best", () => {
    const card = build(
      [catalogType(1, "Body composition", [height])],
      [
        val(1, 1, height, "2025-06-01", 172),
        val(1, 2, height, "2026-10-03", 172.5),
      ],
    );
    expect(card.types[0]?.metrics[0]?.best).toBeNull();
  });

  test("P2 an estimated reading keeps its flag on first, latest and points", () => {
    const card = build(
      [catalogType(1, "Body composition", [weight])],
      [
        val(1, 1, weight, "2025-12-01", 98, true),
        val(1, 2, weight, "2026-10-03", 94),
      ],
    );
    const row = card.types[0]?.metrics[0];
    expect(row?.first).toEqual(rd(98, "2025-12-01", true));
    expect(row?.latest).toEqual(rd(94, "2026-10-03", false));
    expect(row?.points.map((p) => p.isEstimated)).toEqual([true, false]);
  });

  test("P2 points are the last 12 readings oldest first, readings counts all", () => {
    const values = Array.from({ length: 14 }, (_, i) =>
      val(
        1,
        i + 1,
        weight,
        new Date(Date.UTC(2025, 0, 1 + i * 10)).toISOString().slice(0, 10),
        100 - i,
      ),
    );
    const card = build(
      [catalogType(1, "Body composition", [weight])],
      [...values].reverse(),
    );
    const row = card.types[0]?.metrics[0];
    expect(row?.readings).toBe(14);
    expect(row?.points).toHaveLength(12);
    expect(row?.points[0]?.value).toBe(98);
    expect(row?.points[11]?.value).toBe(87);
    expect(row?.first.value).toBe(100);
    expect(row?.latest.value).toBe(87);
    expect(row?.change).toBe(-13);
    expect(row?.best?.value).toBe(87);
  });

  test("P2 change is rounded to 3 decimals", () => {
    const fat = metric(6, { name: "Body fat", unit: "%", better: "lower" });
    const card = build(
      [catalogType(1, "Body composition", [fat])],
      [val(1, 1, fat, "2026-01-10", 24.1), val(1, 2, fat, "2026-02-10", 30.2)],
    );
    expect(card.types[0]?.metrics[0]?.change).toBe(6.1);
  });

  test("BR-REC-106 sections follow the setup order, not the order they arrive in", () => {
    const a = metric(11, { name: "A", sortOrder: 20 });
    const b = metric(12, { name: "B", sortOrder: 30 });
    const c = metric(13, { name: "C", sortOrder: 10 });
    const d = metric(14, { name: "D", sortOrder: 5 });
    const card = build(
      [
        catalogType(3, "Third", [d], 3),
        catalogType(1, "First", [a, b, c], 1),
        catalogType(2, "Second", [], 2),
      ],
      [
        val(1, 1, a, "2026-01-01", 1),
        val(1, 1, b, "2026-01-01", 1),
        val(1, 1, c, "2026-01-01", 1),
        val(3, 2, d, "2026-01-01", 1),
      ],
    );
    expect(card.types.map((t) => t.name)).toEqual(["First", "Third"]);
    expect(card.types[0]?.metrics.map((m) => m.name)).toEqual(["C", "A", "B"]);
  });

  test("BR-REC-106 never-recorded measurements and assessments are left out", () => {
    const recorded = metric(21, { name: "Recorded" });
    const never = metric(22, { name: "Never recorded" });
    const emptyType = metric(23, { name: "In an empty assessment" });
    const card = build(
      [
        catalogType(1, "Has readings", [recorded, never]),
        catalogType(2, "No readings at all", [emptyType]),
      ],
      [val(1, 1, recorded, "2026-01-01", 5)],
    );
    expect(card.types.map((t) => t.name)).toEqual(["Has readings"]);
    expect(card.types[0]?.metrics.map((m) => m.name)).toEqual(["Recorded"]);
  });

  test("BR-REC-106 a turned-off measurement with readings stays, one without readings is left out", () => {
    const off = metric(31, { name: "Off with readings", isActive: false });
    const offEmpty = metric(32, {
      name: "Off, never recorded",
      isActive: false,
    });
    const on = metric(33, { name: "On" });
    const card = build(
      [catalogType(1, "Body composition", [off, offEmpty, on])],
      [val(1, 1, off, "2026-01-01", 5), val(1, 1, on, "2026-01-01", 5)],
    );
    expect(card.types[0]?.metrics.map((m) => m.name)).toEqual([
      "Off with readings",
      "On",
    ]);
  });

  test("BR-REC-106 a turned-off assessment whose measurements are all off still shows its readings", () => {
    // BR-REC-66: turning an assessment off hides its measurements from entry; the report keeps them
    const fran = metric(41, { name: "Fran", isActive: false });
    const card = build(
      [catalogType(1, "Fitness test", [fran])],
      [val(1, 1, fran, "2026-01-01", 250)],
    );
    expect(card.types[0]?.name).toBe("Fitness test");
    expect(card.types[0]?.metrics[0]?.name).toBe("Fran");
  });

  test("BR-REC-106 Surya: 15 body composition rows and 14 fitness rows", () => {
    const body = Array.from({ length: 15 }, (_, i) =>
      metric(100 + i, { name: `Body ${i}` }),
    );
    const fitness = Array.from({ length: 14 }, (_, i) =>
      metric(200 + i, { name: `Fit ${i}` }),
    );
    const values = [
      ...body.map((m, i) => val(1, 1, m, "2026-09-01", i)),
      ...fitness.map((m, i) => val(2, 2, m, "2026-09-01", i)),
    ];
    const card = build(
      [
        catalogType(1, "Body composition", body),
        catalogType(2, "Fitness test", fitness),
      ],
      values,
    );
    expect(card.types.map((t) => t.metrics.length)).toEqual([15, 14]);
  });
});

describe("BR-REC-108 the segmental table", () => {
  // Body composition with two report-table groups of four body parts each.
  const weight = metric(1, { name: "Weight", unit: "kg" });
  const fat = {
    whole: metric(2, {
      name: "Subcut. fat % whole",
      unit: "%",
      tableGroup: "Subcut. fat %",
      tablePart: "whole_body",
    }),
    arms: metric(3, {
      name: "Subcut. fat % arms",
      unit: "%",
      tableGroup: "Subcut. fat %",
      tablePart: "arms",
    }),
    trunk: metric(4, {
      name: "Subcut. fat % trunk",
      unit: "%",
      tableGroup: "Subcut. fat %",
      tablePart: "trunk",
    }),
    legs: metric(5, {
      name: "Subcut. fat % legs",
      unit: "%",
      tableGroup: "Subcut. fat %",
      tablePart: "legs",
    }),
  };
  const muscle = {
    whole: metric(6, {
      name: "Skeletal muscle % whole",
      unit: "%",
      tableGroup: "Skeletal muscle %",
      tablePart: "whole_body",
    }),
    arms: metric(7, {
      name: "Skeletal muscle % arms",
      unit: "%",
      tableGroup: "Skeletal muscle %",
      tablePart: "arms",
    }),
    trunk: metric(8, {
      name: "Skeletal muscle % trunk",
      unit: "%",
      tableGroup: "Skeletal muscle %",
      tablePart: "trunk",
    }),
    legs: metric(9, {
      name: "Skeletal muscle % legs",
      unit: "%",
      tableGroup: "Skeletal muscle %",
      tablePart: "legs",
    }),
  };
  const allMetrics = [weight, ...Object.values(fat), ...Object.values(muscle)];
  const bodyType = catalogType(1, "Body composition", allMetrics);

  test("BR-REC-108 spec example: Arms missing on 12 Sep -> an empty cell there, others filled", () => {
    const card = build(
      [bodyType],
      [
        // an older full assessment must not fill the gap
        val(1, 1, fat.whole, "2026-08-12", 20),
        val(1, 1, fat.arms, "2026-08-12", 31),
        val(1, 1, fat.trunk, "2026-08-12", 21),
        val(1, 1, fat.legs, "2026-08-12", 25),
        val(1, 2, fat.whole, "2026-09-12", 24),
        val(1, 2, fat.trunk, "2026-09-12", 22),
        val(1, 2, fat.legs, "2026-09-12", 26.3),
        val(1, 2, muscle.whole, "2026-09-12", 30.1),
        val(1, 2, muscle.arms, "2026-09-12", 3.3),
        val(1, 2, muscle.trunk, "2026-09-12", 14),
        val(1, 2, muscle.legs, "2026-09-12", 9.1),
      ],
    );
    expect(card.segmental).toEqual({
      on: "2026-09-12",
      isEstimated: false,
      groups: [
        { name: "Subcut. fat %", unit: "%", decimals: 1 },
        { name: "Skeletal muscle %", unit: "%", decimals: 1 },
      ],
      rows: [
        {
          part: "whole_body",
          values: { "Subcut. fat %": 24, "Skeletal muscle %": 30.1 },
        },
        {
          part: "arms",
          values: { "Subcut. fat %": null, "Skeletal muscle %": 3.3 },
        },
        {
          part: "trunk",
          values: { "Subcut. fat %": 22, "Skeletal muscle %": 14 },
        },
        {
          part: "legs",
          values: { "Subcut. fat %": 26.3, "Skeletal muscle %": 9.1 },
        },
      ],
    });
  });

  test("BR-REC-108 the segmental metrics are also ordinary rows of their section", () => {
    const card = build(
      [bodyType],
      [
        val(1, 1, weight, "2026-09-12", 94),
        val(1, 1, fat.whole, "2026-09-12", 24),
      ],
    );
    expect(card.types[0]?.metrics.map((m) => m.name)).toEqual([
      "Weight",
      "Subcut. fat % whole",
    ]);
  });

  test("BR-REC-108 no assessment with a table value: no table", () => {
    const card = build(
      [bodyType],
      [
        val(1, 1, weight, "2026-09-12", 94),
        val(1, 2, weight, "2026-10-01", 93),
      ],
    );
    expect(card.segmental).toBeNull();
  });

  test("BR-REC-108 the latest assessment with any table value is used, newer ones without are skipped", () => {
    const card = build(
      [bodyType],
      [
        val(1, 1, fat.whole, "2026-08-12", 20),
        val(1, 1, fat.legs, "2026-08-12", 25),
        // newest assessment has weight only
        val(1, 2, weight, "2026-10-01", 93),
      ],
    );
    expect(card.segmental?.on).toBe("2026-08-12");
    expect(card.segmental?.rows.map((r) => r.values["Subcut. fat %"])).toEqual([
      20,
      null,
      null,
      25,
    ]);
  });

  test("BR-REC-108 the table is of the latest assessment by date, not the one with most values", () => {
    const card = build(
      [bodyType],
      [
        val(1, 1, fat.whole, "2026-08-12", 20),
        val(1, 1, fat.arms, "2026-08-12", 30),
        val(1, 1, fat.trunk, "2026-08-12", 21),
        val(1, 1, fat.legs, "2026-08-12", 25),
        val(1, 2, fat.whole, "2026-09-12", 19),
      ],
    );
    expect(card.segmental?.on).toBe("2026-09-12");
    expect(card.segmental?.rows.map((r) => r.values["Subcut. fat %"])).toEqual([
      19,
      null,
      null,
      null,
    ]);
  });

  test("BR-REC-108 the date and the estimated flag are the assessment's (shown as 'about')", () => {
    const card = build(
      [bodyType],
      [val(1, 1, fat.whole, "2025-12-01", 24, true)],
    );
    expect(card.segmental?.on).toBe("2025-12-01");
    expect(card.segmental?.isEstimated).toBe(true);
  });

  test("BR-REC-108 rows are always the four body parts in order, even with one value", () => {
    const card = build([bodyType], [val(1, 1, muscle.legs, "2026-09-12", 9.1)]);
    expect(card.segmental?.rows.map((r) => r.part)).toEqual([
      "whole_body",
      "arms",
      "trunk",
      "legs",
    ]);
    expect(
      card.segmental?.rows.map((r) => r.values["Skeletal muscle %"]),
    ).toEqual([null, null, null, 9.1]);
  });

  test("P3 every group is a key in every row; a missing value is null, never absent", () => {
    const card = build([bodyType], [val(1, 1, fat.whole, "2026-09-12", 24)]);
    for (const row of card.segmental?.rows ?? []) {
      expect(Object.keys(row.values).sort()).toEqual([
        "Skeletal muscle %",
        "Subcut. fat %",
      ]);
    }
    expect(card.segmental?.rows[1]?.values["Skeletal muscle %"]).toBeNull();
  });

  test("P3 columns follow the setup order of the measurements", () => {
    const musclesFirst = [
      metric(1, {
        name: "Skeletal whole",
        unit: "%",
        sortOrder: 1,
        tableGroup: "Skeletal muscle %",
        tablePart: "whole_body",
      }),
      metric(2, {
        name: "Subcut whole",
        unit: "%",
        sortOrder: 2,
        tableGroup: "Subcut. fat %",
        tablePart: "whole_body",
      }),
    ];
    const card = build(
      [catalogType(1, "Body composition", musclesFirst)],
      [
        val(1, 1, musclesFirst[0] as CatalogMetric, "2026-09-12", 30),
        val(1, 1, musclesFirst[1] as CatalogMetric, "2026-09-12", 24),
      ],
    );
    expect(card.segmental?.groups.map((g) => g.name)).toEqual([
      "Skeletal muscle %",
      "Subcut. fat %",
    ]);
  });

  test("P3 a group takes the unit and decimals of its first measurement in setup order", () => {
    // listed with the later-in-setup measurement first, to rule out array order
    const second = metric(2, {
      name: "Group second",
      unit: "%",
      decimals: 1,
      sortOrder: 20,
      tableGroup: "Fat",
      tablePart: "arms",
    });
    const first = metric(3, {
      name: "Group first",
      unit: "pct",
      decimals: 2,
      sortOrder: 10,
      tableGroup: "Fat",
      tablePart: "legs",
    });
    const card = build(
      [catalogType(1, "Body composition", [second, first])],
      [val(1, 1, second, "2026-09-12", 24)],
    );
    expect(card.segmental?.groups).toEqual([
      { name: "Fat", unit: "pct", decimals: 2 },
    ]);
  });

  test("P3 a group with only turned-off measurements and no value in that assessment is not a column", () => {
    const offA = metric(1, {
      name: "Off whole",
      isActive: false,
      sortOrder: 1,
      tableGroup: "Retired group",
      tablePart: "whole_body",
    });
    const offB = metric(2, {
      name: "Off arms",
      isActive: false,
      sortOrder: 2,
      tableGroup: "Retired group",
      tablePart: "arms",
    });
    const live = metric(3, {
      name: "Live whole",
      sortOrder: 3,
      tableGroup: "Live group",
      tablePart: "whole_body",
    });
    const card = build(
      [catalogType(1, "Body composition", [offA, offB, live])],
      [val(1, 1, live, "2026-09-12", 24)],
    );
    expect(card.segmental?.groups.map((g) => g.name)).toEqual(["Live group"]);
    for (const row of card.segmental?.rows ?? []) {
      expect(Object.keys(row.values)).toEqual(["Live group"]);
    }
  });

  test("P3 a turned-off measurement that has a value in that assessment keeps its column", () => {
    const off = metric(1, {
      name: "Off whole",
      isActive: false,
      sortOrder: 1,
      tableGroup: "Retired group",
      tablePart: "whole_body",
    });
    const live = metric(2, {
      name: "Live whole",
      sortOrder: 2,
      tableGroup: "Live group",
      tablePart: "whole_body",
    });
    const card = build(
      [catalogType(1, "Body composition", [off, live])],
      [val(1, 1, off, "2026-09-12", 11), val(1, 1, live, "2026-09-12", 24)],
    );
    expect(card.segmental?.groups.map((g) => g.name)).toEqual([
      "Retired group",
      "Live group",
    ]);
    expect(card.segmental?.rows[0]?.values).toEqual({
      "Retired group": 11,
      "Live group": 24,
    });
  });

  test("P3 a group whose measurements are on but has no value in that assessment is an all-empty column", () => {
    const card = build([bodyType], [val(1, 1, fat.whole, "2026-09-12", 24)]);
    expect(card.segmental?.groups.map((g) => g.name)).toEqual([
      "Subcut. fat %",
      "Skeletal muscle %",
    ]);
    expect(
      card.segmental?.rows.map((r) => r.values["Skeletal muscle %"]),
    ).toEqual([null, null, null, null]);
  });

  test("P3 columns come from the measurements of the latest assessment's own type only", () => {
    const oldGroupMetric = metric(1, {
      name: "Old type metric",
      tableGroup: "Old type group",
      tablePart: "whole_body",
    });
    const newGroupMetric = metric(2, {
      name: "New type metric",
      tableGroup: "New type group",
      tablePart: "whole_body",
    });
    const card = build(
      [
        catalogType(1, "Old type", [oldGroupMetric]),
        catalogType(2, "New type", [newGroupMetric]),
      ],
      [
        val(1, 1, oldGroupMetric, "2026-08-01", 10),
        val(2, 2, newGroupMetric, "2026-09-01", 20),
      ],
    );
    expect(card.segmental?.on).toBe("2026-09-01");
    expect(card.segmental?.groups.map((g) => g.name)).toEqual([
      "New type group",
    ]);
  });
});
