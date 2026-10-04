import { beforeAll, describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "../../src/db/client";
import { assessments, measurements } from "../../src/db/schemas";
import {
  addDays,
  endOf,
  expectError,
  MARK,
  type MadeMember,
  type MadeMetric,
  type MadeType,
  nextPhone,
  startFor,
  todayIn,
  useProgressSuite,
} from "./support/suite";

// E39 GET /api/exports/:file: BR-REC-24 (everything exportable, one row per value), BR-REC-117
// (UTF-8 with BOM, comma separated, dates YYYY-MM-DD, columns, value and display, archived column),
// BR-REC-118 / P9 (formula guard), BR-REC-119 (file name, starts at once and streams) and P8 / P10
// of the progress spec. The files hold every member in the database, so each test looks only at
// the rows of the members it made (by member id / the TEST_progress name mark).

const s = useProgressSuite();

const MEMBERS_HEADER =
  "member_id,name,phone,email,date_of_birth,sex,joined_on,objective,notes,plan,membership_status,membership_end_on,archived";
const MEMBERSHIPS_HEADER = "member_id,name,plan,start_on,end_on,archived";
const MEASUREMENTS_HEADER =
  "member_id,name,assessment,measurement,unit,date,estimated,value,display,archived";

const NOTES_WITH_SPECIALS = 'Likes "RX", hates burpees\nline two';

let body: MadeType;
let weight: MadeMetric;
let height: MadeMetric;
let delta: MadeMetric;
let fit: MadeType;
let plank: MadeMetric;
let pullUps: MadeMetric;
let oldTest: MadeMetric;

let alice: MadeMember;
let bob: MadeMember;
let carl: MadeMember;
const phones = { alice: "", bob: "", carl: "" };
let alicePeriods: { plan: "quarterly" | "monthly"; startOn: string }[] = [];
let bobPeriods: { plan: "monthly" | "annual"; startOn: string }[] = [];
let carlStart = "";
let GOLDEN: Set<string>;

const D1 = () => s.day(-60);
const D2 = () => s.day(-30);
const D3 = () => s.day(-10);

beforeAll(async () => {
  body = await s.makeType({ label: "body" });
  weight = await s.makeMetric(body.id, {
    name: "Weight",
    unit: "kg",
    decimals: 1,
    better: "lower",
  });
  height = await s.makeMetric(body.id, {
    name: "Height",
    unit: "cm",
    decimals: 1,
    better: "none",
  });
  delta = await s.makeMetric(body.id, {
    name: "Delta",
    unit: "kg",
    decimals: 1,
    better: "none",
  });
  fit = await s.makeType({ label: "fit" });
  plank = await s.makeMetric(fit.id, {
    name: "Plank",
    unit: "",
    datatype: "duration",
    decimals: 0,
    better: "higher",
  });
  pullUps = await s.makeMetric(fit.id, {
    name: "Pull-ups",
    unit: "reps",
    decimals: 0,
    better: "higher",
  });
  oldTest = await s.makeMetric(fit.id, {
    name: "Old test",
    unit: "kg",
    decimals: 1,
    better: "higher",
    isActive: false,
  });

  phones.alice = nextPhone();
  phones.bob = nextPhone();
  phones.carl = nextPhone();

  alicePeriods = [
    { plan: "quarterly", startOn: startFor("quarterly", s.day(-40)) },
    { plan: "monthly", startOn: startFor("monthly", s.day(7)) },
  ];
  alice = await s.makeMember({
    name: "alice Export",
    sex: "female",
    dateOfBirth: "1990-02-03",
    email: "alice@example.com",
    objective: "fat_loss",
    notes: NOTES_WITH_SPECIALS,
    joinedOn: "2025-01-05",
    phone: phones.alice,
    periods: alicePeriods,
  });
  bobPeriods = [
    { plan: "monthly", startOn: s.day(-500) },
    { plan: "annual", startOn: s.day(-100) },
  ];
  bob = await s.makeMember({
    name: "Bob Export",
    sex: "male",
    dateOfBirth: "1985-07-20",
    joinedOn: "2025-06-01",
    phone: phones.bob,
    periods: bobPeriods,
  });
  carlStart = startFor("half_annual", s.day(-200));
  carl = await s.makeMember({
    name: "Carl Export",
    sex: "male",
    dateOfBirth: "1978-11-30",
    joinedOn: "2025-03-01",
    archived: true,
    phone: phones.carl,
    periods: [{ plan: "half_annual", startOn: carlStart }],
  });
  GOLDEN = new Set([alice.id, bob.id, carl.id]);

  // alice: an estimated weight on D1; on D2 body composition and fitness test together
  await s.record(alice.id, body.id, D1(), [[weight, 94.5]], {
    estimated: true,
  });
  await s.record(alice.id, body.id, D2(), [
    [weight, 94],
    [height, 172.5],
    [delta, -1.5],
  ]);
  await s.record(alice.id, fit.id, D2(), [
    [plank, 122],
    [pullUps, 12],
    [oldTest, 55.5],
  ]);
  await s.record(bob.id, fit.id, D3(), [[plank, 95]]);
  await s.record(carl.id, body.id, D1(), [[weight, 80]]);
});

/** The rows (header dropped) of the golden members, in file order. */
function golden(rows: string[][]): string[][] {
  return rows.slice(1).filter((r) => GOLDEN.has(r[0] as string));
}

const memberRow = (
  m: MadeMember,
  cells: {
    phone: string;
    email: string;
    dateOfBirth: string;
    sex: string;
    joinedOn: string;
    objective: string;
    notes: string;
    plan: string;
    status: string;
    endOn: string;
    archived: string;
  },
): string[] => [
  m.id,
  m.fullName,
  cells.phone,
  cells.email,
  cells.dateOfBirth,
  cells.sex,
  cells.joinedOn,
  cells.objective,
  cells.notes,
  cells.plan,
  cells.status,
  cells.endOn,
  cells.archived,
];

describe("E39 the response itself (BR-REC-117 / 119, P10)", () => {
  test("BR-REC-117 / P10 members.csv: 200, text/csv UTF-8, attachment named members-<gym today>.csv, no cache, no compression", async () => {
    const res = await s.rawGet("/api/exports/members.csv", {
      headers: { "Accept-Encoding": "gzip, br" },
    });
    expect(res.status).toBe(200);
    expect((res.headers.get("content-type") ?? "").toLowerCase()).toBe(
      "text/csv; charset=utf-8",
    );
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="members-${s.today()}.csv"`,
    );
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-encoding")).toBeNull();
    await res.text();
  });

  for (const file of ["memberships", "measurements"]) {
    test(`BR-REC-119 ${file}.csv is named ${file}-<gym today>.csv`, async () => {
      const res = await s.rawGet(`/api/exports/${file}.csv`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="${file}-${s.today()}.csv"`,
      );
      expect((res.headers.get("content-type") ?? "").toLowerCase()).toBe(
        "text/csv; charset=utf-8",
      );
      await res.text();
    });
  }

  test("BR-REC-119 the file name uses the gym's day, not the server's (spec example: measurements-2026-10-03.csv shape)", async () => {
    const utcDay = new Date().toISOString().slice(0, 10);
    const zone =
      todayIn("Pacific/Kiritimati") !== utcDay
        ? "Pacific/Kiritimati"
        : "Pacific/Pago_Pago";
    await s.setSettings({ timezone: zone });
    try {
      const res = await s.rawGet("/api/exports/measurements.csv");
      const gymDay = todayIn(zone);
      expect(gymDay).not.toBe(utcDay);
      expect(res.headers.get("content-disposition")).toBe(
        `attachment; filename="measurements-${gymDay}.csv"`,
      );
      expect(res.headers.get("content-disposition")).toMatch(
        /^attachment; filename="measurements-\d{4}-\d{2}-\d{2}\.csv"$/,
      );
      await res.text();
    } finally {
      await s.setSettings({ timezone: "Asia/Kolkata" });
    }
  });

  test("BR-REC-117 the body starts with the UTF-8 byte order mark EF BB BF", async () => {
    const res = await s.rawGet("/api/exports/members.csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });

  const headerLines: [string, string][] = [
    ["members.csv", MEMBERS_HEADER],
    ["memberships.csv", MEMBERSHIPS_HEADER],
    ["measurements.csv", MEASUREMENTS_HEADER],
  ];
  for (const [file, header] of headerLines) {
    test(`P8 ${file} starts with the header row (snake_case, in order), ending CRLF`, async () => {
      const { text } = await s.exportCsv(file);
      expect(text.startsWith(`\uFEFF${header}\r\n`)).toBe(true);
    });

    test(`P8 ${file}: every line, the last included, ends with CRLF`, async () => {
      const { text } = await s.exportCsv(file);
      expect(text.endsWith("\r\n")).toBe(true);
      expect(text.replace(/\r\n/g, "")).not.toMatch(/\r(?!\n)/);
    });
  }

  test("BR-REC-24 an unknown file name is 404 NOT_FOUND, as the JSON error", async () => {
    for (const file of [
      "members",
      "members.xlsx",
      "everything.csv",
      "members.csv.gz",
    ]) {
      const reply = await s.get(`/api/exports/${file}`);
      expectError(reply, 404, "NOT_FOUND");
    }
  });
});

describe("BR-REC-24 / 117 / P8 members.csv", () => {
  test("BR-REC-117 one row per member, in the P8 columns, with codes and yes / no", async () => {
    const { rows } = await s.exportCsv("members.csv");
    expect(golden(rows)).toEqual([
      memberRow(alice, {
        phone: phones.alice,
        email: "alice@example.com",
        dateOfBirth: "1990-02-03",
        sex: "female",
        joinedOn: "2025-01-05",
        objective: "fat_loss",
        notes: NOTES_WITH_SPECIALS,
        plan: "monthly",
        status: "expiring",
        endOn: endOf("monthly", alicePeriods[1]?.startOn as string),
        archived: "no",
      }),
      memberRow(bob, {
        phone: phones.bob,
        email: "",
        dateOfBirth: "1985-07-20",
        sex: "male",
        joinedOn: "2025-06-01",
        objective: "",
        notes: "",
        plan: "annual",
        status: "active",
        endOn: endOf("annual", s.day(-100)),
        archived: "no",
      }),
      memberRow(carl, {
        phone: phones.carl,
        email: "",
        dateOfBirth: "1978-11-30",
        sex: "male",
        joinedOn: "2025-03-01",
        objective: "",
        notes: "",
        plan: "half_annual",
        status: "expired",
        endOn: endOf("half_annual", carlStart),
        archived: "yes",
      }),
    ]);
  });

  test("BR-REC-117 archived members are included with archived = yes", async () => {
    const { rows } = await s.exportCsv("members.csv");
    const carlRow = rows.find((r) => r[0] === carl.id);
    expect(carlRow?.[12]).toBe("yes");
  });

  test("BR-REC-24 / P8 a cell with a comma, quotes and a line feed is wrapped in quotes with inner quotes doubled", async () => {
    const { text } = await s.exportCsv("members.csv");
    expect(text).toContain(`"Likes ""RX"", hates burpees\nline two"`);
  });

  test("BR-REC-24 every member in the database is exported: one row per member", async () => {
    const { rows } = await s.exportCsv("members.csv");
    const [row] = Array.from(
      await db.execute(sql`select count(*)::int as n from members`),
    ) as { n: number }[];
    expect(rows.length - 1).toBe((row as { n: number }).n);
  });
});

describe("BR-REC-24 / 117 / P8 memberships.csv", () => {
  test("BR-REC-117 one row per period, in the P8 columns, ordered by name then start date", async () => {
    const { rows } = await s.exportCsv("memberships.csv");
    expect(golden(rows)).toEqual([
      [
        alice.id,
        alice.fullName,
        "quarterly",
        alicePeriods[0]?.startOn as string,
        endOf("quarterly", alicePeriods[0]?.startOn as string),
        "no",
      ],
      [
        alice.id,
        alice.fullName,
        "monthly",
        alicePeriods[1]?.startOn as string,
        endOf("monthly", alicePeriods[1]?.startOn as string),
        "no",
      ],
      [
        bob.id,
        bob.fullName,
        "monthly",
        s.day(-500),
        endOf("monthly", s.day(-500)),
        "no",
      ],
      [
        bob.id,
        bob.fullName,
        "annual",
        s.day(-100),
        endOf("annual", s.day(-100)),
        "no",
      ],
      [
        carl.id,
        carl.fullName,
        "half_annual",
        carlStart,
        endOf("half_annual", carlStart),
        "yes",
      ],
    ]);
  });

  test("BR-REC-24 every period in the database is exported: one row per period", async () => {
    const { rows } = await s.exportCsv("memberships.csv");
    const [row] = Array.from(
      await db.execute(sql`select count(*)::int as n from membership_periods`),
    ) as { n: number }[];
    expect(rows.length - 1).toBe((row as { n: number }).n);
  });
});

describe("BR-REC-24 / 117 / P8 measurements.csv", () => {
  const row = (
    m: MadeMember,
    type: MadeType,
    metric: MadeMetric,
    date: string,
    estimated: string,
    value: string,
    display: string,
    archived: string,
  ): string[] => [
    m.id,
    m.fullName,
    type.name,
    metric.name,
    metric.unit,
    date,
    estimated,
    value,
    display,
    archived,
  ];

  test("BR-REC-117 one row per stored value: value (seconds for times) and display (2:02), ordered by name, date, assessment then measurement setup order", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    expect(golden(rows)).toEqual([
      row(alice, body, weight, D1(), "yes", "94.5", "94.5", "no"),
      row(alice, body, weight, D2(), "no", "94", "94.0", "no"),
      row(alice, body, height, D2(), "no", "172.5", "172.5", "no"),
      // a negative value is guarded like any cell: it exports as text (P9)
      row(alice, body, delta, D2(), "no", "'-1.5", "'-1.5", "no"),
      // Plank 122 s -> value 122, display 2:02 (BR-REC-117 example)
      row(alice, fit, plank, D2(), "no", "122", "2:02", "no"),
      row(alice, fit, pullUps, D2(), "no", "12", "12", "no"),
      // a turned-off measurement keeps its history in the export
      row(alice, fit, oldTest, D2(), "no", "55.5", "55.5", "no"),
      row(bob, fit, plank, D3(), "no", "95", "1:35", "no"),
      row(carl, body, weight, D1(), "no", "80", "80.0", "yes"),
    ]);
  });

  test("BR-REC-24 row-count test: one row per metric per date, the file has as many rows as there are stored values", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    const [row] = Array.from(
      await db.execute(sql`select count(*)::int as n from measurements`),
    ) as { n: number }[];
    expect(rows.length - 1).toBe((row as { n: number }).n);
  });

  test("BR-REC-117 the golden members' rows add up to the stored values of those members", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    expect(golden(rows)).toHaveLength(9);
  });

  test("BR-REC-117 archived members are included with archived = yes", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    const carlRows = rows.filter((r) => r[0] === carl.id);
    expect(carlRows).toHaveLength(1);
    expect(carlRows[0]?.[9]).toBe("yes");
  });

  test("BR-REC-117 the estimated column is yes only for the estimated assessment", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    const aliceRows = rows.filter((r) => r[0] === alice.id);
    expect(aliceRows.map((r) => r[6])).toEqual([
      "yes",
      "no",
      "no",
      "no",
      "no",
      "no",
      "no",
    ]);
  });

  test("BR-REC-117 dates are YYYY-MM-DD", async () => {
    const { rows } = await s.exportCsv("measurements.csv");
    expect(golden(rows).length).toBeGreaterThan(0);
    for (const r of golden(rows)) {
      expect(r[5]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("P8 ordering: name (any case), member id, then date and setup order", () => {
  test("P8 names sort ignoring case: alice, Bob, carl, Dave (not the ASCII order Bob, Dave, alice, carl)", async () => {
    const type = await s.makeType({ label: "order" });
    const m = await s.makeMetric(type.id, { name: "Count", decimals: 0 });
    const ids: string[] = [];
    for (const name of [
      "Dave Order",
      "carl Order",
      "Bob Order",
      "alice Order",
    ]) {
      const member = await s.makeMember({ name });
      ids.push(member.id);
      await s.record(member.id, type.id, s.day(-5), [[m, 1]]);
    }
    const mine = new Set(ids);
    for (const file of ["members.csv", "memberships.csv", "measurements.csv"]) {
      const { rows } = await s.exportCsv(file);
      const names = rows
        .slice(1)
        .filter((r) => mine.has(r[0] as string))
        .map((r) => (r[1] as string).replace(` ${MARK}`, ""));
      expect({ file, names }).toEqual({
        file,
        names: ["alice Order", "Bob Order", "carl Order", "Dave Order"],
      });
    }
  });

  test("P8 the same name: by member id", async () => {
    const twinA = await s.makeMember({ name: "Twin Order" });
    const twinB = await s.makeMember({ name: "Twin Order" });
    const expected = [twinA.id, twinB.id].sort();
    for (const file of ["members.csv", "memberships.csv"]) {
      const { rows } = await s.exportCsv(file);
      const ids = rows
        .slice(1)
        .map((r) => r[0] as string)
        .filter((id) => id === twinA.id || id === twinB.id);
      expect({ file, ids }).toEqual({ file, ids: expected });
    }
  });

  test("P8 measurements of one member and day: assessment setup order, then measurement setup order", async () => {
    // created in the opposite order of their setup order, on purpose
    const later = await s.makeType({ label: "later" });
    const earlier = await s.makeType({
      label: "earlier",
      sortOrder: later.sortOrder - 1,
    });
    const laterB = await s.makeMetric(later.id, { name: "L-B", sortOrder: 20 });
    const laterA = await s.makeMetric(later.id, { name: "L-A", sortOrder: 10 });
    const earlierOnly = await s.makeMetric(earlier.id, {
      name: "E-1",
      sortOrder: 99,
    });
    const member = await s.makeMember({ name: "Setup Order" });
    await s.record(member.id, later.id, s.day(-5), [
      [laterB, 1],
      [laterA, 2],
    ]);
    await s.record(member.id, earlier.id, s.day(-5), [[earlierOnly, 3]]);
    // an earlier day is exported before the later day whatever the setup order says
    await s.record(member.id, later.id, s.day(-9), [[laterB, 4]]);
    const { rows } = await s.exportCsv("measurements.csv");
    const mine = rows.filter((r) => r[0] === member.id);
    expect(mine.map((r) => `${r[5]} ${r[3]}`)).toEqual([
      `${s.day(-9)} L-B`,
      `${s.day(-5)} E-1`,
      `${s.day(-5)} L-A`,
      `${s.day(-5)} L-B`,
    ]);
  });
});

describe("BR-REC-118 / P9 the formula guard in a file", () => {
  test("BR-REC-118 notes, phone, name and email starting with = + - @ or a tab are written as text with a leading '", async () => {
    const formula = '=HYPERLINK("http://x","y")';
    const a = await s.makeMember({
      name: "=SUM(1+1) Guard",
      phone: "+919876543210",
      email: "-odd@example.com",
      notes: formula,
    });
    const b = await s.makeMember({ name: "At Guard", notes: "@home" });
    const c = await s.makeMember({ name: "Minus Guard", notes: "-5 reps" });
    const d = await s.makeMember({ name: "Tab Guard", notes: "\tTabbed" });
    const e = await s.makeMember({ name: "Plus Guard", notes: "+1 later" });
    const { rows, text } = await s.exportCsv("members.csv");
    const byId = (id: string) => rows.find((r) => r[0] === id) as string[];

    expect(byId(a.id)[1]).toBe(`'${a.fullName}`);
    expect(byId(a.id)[2]).toBe("'+919876543210");
    expect(byId(a.id)[3]).toBe("'-odd@example.com");
    expect(byId(a.id)[8]).toBe(`'${formula}`);
    expect(byId(b.id)[8]).toBe("'@home");
    expect(byId(c.id)[8]).toBe("'-5 reps");
    expect(byId(d.id)[8]).toBe("'\tTabbed");
    expect(byId(e.id)[8]).toBe("'+1 later");
    // the guarded formula with commas and quotes is also quoted properly
    expect(text).toContain(`"'=HYPERLINK(""http://x"",""y"")"`);
  });

  test("BR-REC-118 a cell that merely contains = + - @ later is left alone", async () => {
    const m = await s.makeMember({
      name: "Middle Marks",
      notes: "a=b, x-ray me@gym.example 1+1",
    });
    const { rows } = await s.exportCsv("members.csv");
    const found = rows.find((r) => r[0] === m.id) as string[];
    expect(found[8]).toBe("a=b, x-ray me@gym.example 1+1");
  });

  test("BR-REC-117 names are UTF-8: accents and non-Latin letters survive", async () => {
    const m = await s.makeMember({ name: "Zoë Müller 张伟" });
    const { rows } = await s.exportCsv("members.csv");
    const found = rows.find((r) => r[0] === m.id) as string[];
    expect(found[1]).toBe(`Zoë Müller 张伟 ${MARK}`);
  });
});

describe("BR-REC-119 the file starts at once and streams", () => {
  const COUNT_DATES = 300;
  const COUNT_METRICS = 100; // 300 x 100 = 30,000 values
  let heavy: MadeMember;

  beforeAll(async () => {
    const type = await s.makeType({ label: "heavy" });
    const metricIds: string[] = [];
    for (let i = 0; i < COUNT_METRICS; i++) {
      const metric = await s.makeMetric(type.id, {
        name: `Heavy ${String(i).padStart(3, "0")}`,
        decimals: 1,
      });
      metricIds.push(metric.id);
    }
    heavy = await s.makeMember({ name: "Heavy Exporter" });
    const dates = Array.from({ length: COUNT_DATES }, (_, i) =>
      addDays("2020-01-01", i),
    );
    const inserted = await db
      .insert(assessments)
      .values(
        dates.map((assessedOn) => ({
          memberId: heavy.id,
          typeId: type.id,
          assessedOn,
        })),
      )
      .returning({ id: assessments.id, on: assessments.assessedOn });
    const rows = inserted.flatMap((a) =>
      metricIds.map((metricId, i) => ({
        assessmentId: a.id,
        metricId,
        memberId: heavy.id,
        measuredOn: a.on,
        value: 50 + (i % 40) + 0.5,
      })),
    );
    for (let from = 0; from < rows.length; from += 2000) {
      await db.insert(measurements).values(rows.slice(from, from + 2000));
    }
  });

  test("BR-REC-119 with 30,000 values the first bytes arrive within 1 second, in more than one chunk, and every value is a row", async () => {
    const t0 = performance.now();
    const res = await s.rawGet("/api/exports/measurements.csv");
    const headersAt = performance.now() - t0;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      `attachment; filename="measurements-${s.today()}.csv"`,
    );

    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    const chunks: Uint8Array[] = [];
    let firstChunkAt = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (firstChunkAt < 0) firstChunkAt = performance.now() - t0;
      chunks.push(value);
    }

    expect(headersAt).toBeLessThan(1000);
    expect(firstChunkAt).toBeGreaterThanOrEqual(0);
    expect(firstChunkAt).toBeLessThan(1000);
    // streamed in batches, not built as one string and sent at the end
    expect(chunks.length).toBeGreaterThan(1);

    const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.length;
    }
    expect(Array.from(all.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(all);
    const heavyRows = text
      .split("\r\n")
      .filter((line) => line.startsWith(`${heavy.id},`));
    expect(heavyRows).toHaveLength(COUNT_DATES * COUNT_METRICS);
  }, 60_000);

  test("BR-REC-119 the app stays usable while a big export is read: another request is answered while the file is still streaming", async () => {
    const res = await s.rawGet("/api/exports/measurements.csv");
    expect(res.status).toBe(200);
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    await reader.read(); // first chunk only; the rest is not pulled yet
    const t0 = performance.now();
    const other = await s.activeByPlan();
    const took = performance.now() - t0;
    expect(other.status).toBe(200);
    expect(took).toBeLessThan(2000);
    await reader.cancel();
  }, 60_000);
});
