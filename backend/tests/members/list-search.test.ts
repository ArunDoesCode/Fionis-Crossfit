import { beforeAll, describe, expect, test } from "bun:test";

import {
  bare,
  dataOf,
  expectError,
  type ListItem,
  MARK,
  mine,
  nextPhone,
  type SeedPeriod,
  useMembersSuite,
} from "./support/suite";

// E16 GET /api/members: find and list members.
// BR-REC-06 (archived are left out), 07 (search), 46 (phone match on the last 10 digits),
// 47 (duplicate-phone lookup), 52 (status from the latest period), 56 (search order),
// 57 (list and chips), 155 (paging), 154 (envelope).
// Every group of fixtures has its own name token (and `q` = that token), so a list is
// never polluted by the members another group made.

const s = useMembersSuite();

/** Bare names (without the MARK suffix) of this suite's members in `items`, in order. */
const names = (items: ListItem[]) =>
  mine(items).map((item) => bare(item.fullName));

const search = async (query: Record<string, string | number | undefined>) =>
  dataOf<ListItem[]>(await s.list({ pageSize: 100, ...query }));

/** A period that ends `n` days from today (negative: ended). */
const endsIn = (n: number): SeedPeriod[] => [
  { plan: "annual", startOn: s.day(n - 364), endOn: s.day(n) },
];

describe("E16 email on each item (BR-REC-205)", () => {
  beforeAll(async () => {
    await s.seedMember({
      name: "Emailtok Has",
      email: "emailtok.has@example.com",
    });
    await s.seedMember({ name: "Emailtok None", email: null });
    await s.seedMember({
      name: "Emailtok Other",
      email: "other.person@example.org",
    });
  });

  const byName = async (name: string) =>
    mine(await search({ q: "emailtok" })).find(
      (i) => bare(i.fullName) === name,
    );

  test("BR-REC-205 a member with an email on file shows that email", async () => {
    expect((await byName("Emailtok Has"))?.email).toBe(
      "emailtok.has@example.com",
    );
  });

  test("BR-REC-205 a member without an email shows null, the key is present", async () => {
    const item = (await byName("Emailtok None")) as Record<string, unknown>;
    expect("email" in item).toBe(true);
    expect(item.email).toBeNull();
  });

  test("BR-REC-205 each member shows their own email, not a neighbour's", async () => {
    expect((await byName("Emailtok Other"))?.email).toBe(
      "other.person@example.org",
    );
  });
});

describe("E16 search by text (BR-REC-07, 56)", () => {
  let phoneOfK = "";
  beforeAll(async () => {
    phoneOfK = nextPhone();
    await s.seedMember({
      name: "Surya K",
      phone: phoneOfK,
      assessedOn: [s.day(-40), s.day(-12)],
    });
    await s.seedMember({ name: "Surya Pratap" });
    await s.seedMember({ name: "Asura M" });
    await s.seedMember({ name: "Anita Rao" });
  });

  test('BR-REC-56 "sur" lists "Surya K", "Surya Pratap", then "Asura M": names starting with the text first, then the rest A-Z', async () => {
    const items = await search({ q: "sur" });
    expect(names(items)).toEqual(["Surya K", "Surya Pratap", "Asura M"]);
  });

  test("BR-REC-56 sortDir=desc reverses the order inside each group, the starts-with group still first", async () => {
    const items = await search({ q: "sur", sortDir: "desc" });
    expect(names(items)).toEqual(["Surya Pratap", "Surya K", "Asura M"]);
  });

  test("BR-REC-56 sortBy=name is the same as leaving it out", async () => {
    const items = await search({ q: "sur", sortBy: "name" });
    expect(names(items)).toEqual(["Surya K", "Surya Pratap", "Asura M"]);
  });

  test("BR-REC-07 each result shows name, phone, last assessment date and membership status", async () => {
    const items = await search({ q: "surya k" });
    const item = mine(items)[0];
    expect(item?.fullName).toBe(`Surya K ${MARK}`);
    expect(item?.phone).toBe(phoneOfK);
    expect(item?.lastAssessedOn).toBe(s.day(-12));
    expect(item?.membership.status).toBe("active");
    expect(item?.archivedAt).toBeNull();
  });

  test("BR-REC-07 a member who was never assessed has lastAssessedOn null", async () => {
    const items = await search({ q: "asura" });
    expect(mine(items)[0]?.lastAssessedOn).toBeNull();
  });

  test("BR-REC-205 the item holds exactly id, fullName, phone, email, lastAssessedOn, archivedAt and membership { status, plan, endOn, daysLeft }", async () => {
    const item = mine(await search({ q: "asura" }))[0];
    expect(Object.keys(item ?? {}).sort()).toEqual([
      "archivedAt",
      "email",
      "fullName",
      "id",
      "lastAssessedOn",
      "membership",
      "phone",
    ]);
    expect(Object.keys(item?.membership ?? {}).sort()).toEqual([
      "daysLeft",
      "endOn",
      "plan",
      "status",
    ]);
  });

  test("BR-REC-56 search ignores upper and lower case", async () => {
    const lower = await search({ q: "sur" });
    const upper = await search({ q: "SUR" });
    const mixed = await search({ q: "sUr" });
    expect(names(upper)).toEqual(names(lower));
    expect(names(mixed)).toEqual(names(lower));
  });

  test("BR-REC-07 two characters are enough", async () => {
    const items = await search({ q: "su" });
    expect(names(items)).toEqual(
      expect.arrayContaining(["Surya K", "Surya Pratap"]),
    );
  });

  test("BR-REC-07 the text is trimmed: ' sur ' finds what 'sur' finds", async () => {
    const items = await search({ q: " sur " });
    expect(names(items)).toEqual(["Surya K", "Surya Pratap", "Asura M"]);
  });

  test("BR-REC-07 the text matches part of the name, not only the start", async () => {
    const items = await search({ q: "ratap" });
    expect(names(items)).toEqual(["Surya Pratap"]);
  });

  test("BR-REC-07 a space inside the text is part of the match: 'surya p' finds Surya Pratap only", async () => {
    const items = await search({ q: "surya p" });
    expect(names(items)).toEqual(["Surya Pratap"]);
  });

  test("BR-REC-07 a text that matches nobody gives an empty list, not an error", async () => {
    const reply = await s.list({ q: "qqzzxxww" });
    expect(dataOf<ListItem[]>(reply)).toEqual([]);
  });

  for (const q of ["s", " s ", "a", "%"]) {
    test(`BR-REC-07 the text ${JSON.stringify(q)} is under 2 characters: 400 VALIDATION_ERROR on q`, async () => {
      const reply = await s.list({ q });
      expectError(reply, 400, "VALIDATION_ERROR");
      const issues = (reply.body?.details?.issues ?? []) as { path: string }[];
      expect(issues.some((i) => String(i.path).includes("q"))).toBe(true);
    });
  }

  test("BR-REC-07 search finds a member by the start of the phone number, with or without spaces and dashes", async () => {
    const head = phoneOfK.slice(0, 5);
    const tail = phoneOfK.slice(5);
    for (const q of [
      phoneOfK,
      `${head} ${tail}`,
      `${head}-${tail}`,
      `${head} ${tail.slice(0, 3)}`,
      phoneOfK.slice(4, 9),
    ]) {
      const items = await search({ q });
      expect(names(items), `q=${q}`).toContain("Surya K");
    }
  });

  test("BR-REC-07 a phone search does not return members whose phone does not contain the digits", async () => {
    const items = await search({ q: phoneOfK });
    expect(names(items)).toEqual(["Surya K"]);
  });
});

describe("E16 search by email, case and special characters (BR-REC-07)", () => {
  const salt = Math.random().toString(36).slice(2, 8);

  test("BR-REC-07 the text matches part of the email, ignoring case", async () => {
    await s.seedMember({
      name: "Mail Person",
      email: `zq${salt}.coach@example.com`,
    });
    for (const q of [
      `zq${salt}.coach`,
      `ZQ${salt}.COACH`,
      `${salt}.coach@exa`,
    ]) {
      const items = await search({ q });
      expect(names(items), `q=${q}`).toEqual(["Mail Person"]);
    }
  });

  test("BR-REC-07 a % in the text is a plain character: '50%' finds '50% Off' and not '50x Off'", async () => {
    await s.seedMember({ name: `Zpct${salt} 50% Off` });
    await s.seedMember({ name: `Zpct${salt} 50x Off` });
    const items = await search({ q: "50% off" });
    expect(names(items).filter((n) => n.includes(`Zpct${salt}`))).toEqual([
      `Zpct${salt} 50% Off`,
    ]);
  });

  test("BR-REC-07 an _ in the text is a plain character: 'd_e' finds 'Und_er' and not 'Undxer'", async () => {
    await s.seedMember({ name: `Zund${salt} Und_er` });
    await s.seedMember({ name: `Zund${salt} Undxer` });
    const items = await search({ q: "und_er" });
    expect(names(items).filter((n) => n.includes(`Zund${salt}`))).toEqual([
      `Zund${salt} Und_er`,
    ]);
  });

  test("BR-REC-56 names starting with the text come first even when they start with a lower-case letter, and the order ignores case", async () => {
    await s.seedMember({ name: "zurich A" });
    await s.seedMember({ name: "Zurek B" });
    await s.seedMember({ name: "Azur C" });
    const items = await search({ q: "zur" });
    expect(names(items)).toEqual(["Zurek B", "zurich A", "Azur C"]);
  });

  test("BR-REC-56 members with the same name come in a fixed order: by id", async () => {
    await s.seedMember({ name: "Ztwin Same" });
    await s.seedMember({ name: "Ztwin Same" });
    const items = mine(await search({ q: "ztwin" }));
    expect(items).toHaveLength(2);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe("E16 phone lookup for the duplicate warning (BR-REC-46, 47)", () => {
  // one number, written three ways, plus an archived member and a stranger
  let base = "";
  let withCountryCode = "";
  let plain = "";
  let archived = "";
  let stranger = "";
  beforeAll(async () => {
    base = nextPhone();
    const other = nextPhone();
    withCountryCode = (
      await s.seedMember({ name: "Zdup Anita", phone: `+91${base}` })
    ).id;
    plain = (await s.seedMember({ name: "Zdup Plain", phone: base })).id;
    archived = (
      await s.seedMember({ name: "Zdup Archived", phone: base, archived: true })
    ).id;
    stranger = (await s.seedMember({ name: "Zdup Stranger", phone: other })).id;
  });

  const ids = (items: ListItem[]) => items.map((i) => i.id);

  test("BR-REC-46 phone finds every non-archived member whose last 10 digits are the same (+91 prefix or not)", async () => {
    const items = await search({ phone: base });
    expect(ids(items).sort()).toEqual([withCountryCode, plain].sort());
  });

  test("BR-REC-46 the phone sent is cleaned like a member's phone: spaces, dashes and the country code do not matter", async () => {
    for (const phone of [
      `+91 ${base.slice(0, 5)}-${base.slice(5)}`,
      `(${base.slice(0, 5)}) ${base.slice(5)}`,
      `91${base}`,
    ]) {
      const items = await search({ phone });
      expect(ids(items).sort(), `phone=${phone}`).toEqual(
        [withCountryCode, plain].sort(),
      );
    }
  });

  test("BR-REC-47 the result names the other member's name and phone (what the warning shows)", async () => {
    const items = await search({ phone: base });
    const found = items.find((i) => i.id === withCountryCode);
    expect(found?.fullName).toBe(`Zdup Anita ${MARK}`);
    expect(found?.phone).toBe(`+91${base}`);
  });

  test("BR-REC-47 archived members are included with status=any, and are marked by archivedAt", async () => {
    const items = await search({ phone: base, status: "any" });
    expect(ids(items).sort()).toEqual(
      [withCountryCode, plain, archived].sort(),
    );
    expect(items.find((i) => i.id === archived)?.archivedAt).not.toBeNull();
    expect(items.find((i) => i.id === plain)?.archivedAt).toBeNull();
  });

  test("BR-REC-47 status=archived returns only the archived one", async () => {
    const items = await search({ phone: base, status: "archived" });
    expect(ids(items)).toEqual([archived]);
  });

  test("BR-REC-47 a phone nobody has gives an empty list", async () => {
    const items = await search({ phone: nextPhone() });
    expect(items).toEqual([]);
  });

  test("BR-REC-47 the stranger with another phone is never in the answer", async () => {
    const items = await search({ phone: base, status: "any" });
    expect(ids(items)).not.toContain(stranger);
  });

  test("BR-REC-46 a phone of fewer than 10 digits is 400 VALIDATION_ERROR", async () => {
    expectError(await s.list({ phone: "984501234" }), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-46 a phone with letters is 400 VALIDATION_ERROR", async () => {
    expectError(await s.list({ phone: "98450abcde" }), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-46 phone and q together must both match", async () => {
    const both = await search({ phone: base, q: "zdup anita" });
    expect(ids(both)).toEqual([withCountryCode]);
    const none = await search({ phone: base, q: "zdup stranger" });
    expect(none).toEqual([]);
  });
});

describe("E16 status chips (BR-REC-06, 52, 57)", () => {
  const token = "Zstat";
  const ALL_ACTIVE = ["Active", "Edge15", "Future"];
  const EXPIRING_14 = ["Edge14", "Edge3", "Edge4", "Expiring0", "Expiring7"];
  const EXPIRED = ["Expired1", "Expired100"];
  const ARCHIVED = ["ArchivedEnded", "ArchivedRunning"];

  beforeAll(async () => {
    const seed = (label: string, periods?: SeedPeriod[], archived = false) =>
      s.seedMember({
        name: `${token} ${label}`,
        ...(periods ? { periods } : {}),
        archived,
      });
    await seed("Active", endsIn(264));
    await seed("Expiring7", endsIn(7));
    await seed("Expiring0", endsIn(0));
    await seed("Edge3", endsIn(3));
    await seed("Edge4", endsIn(4));
    await seed("Edge14", endsIn(14));
    await seed("Edge15", endsIn(15));
    await seed("Expired1", endsIn(-1));
    await seed("Expired100", endsIn(-100));
    await seed("Future", [
      { plan: "annual", startOn: s.day(5), endOn: s.day(369) },
    ]);
    await seed("ArchivedRunning", endsIn(200), true);
    await seed("ArchivedEnded", endsIn(-150), true);
  });

  const withStatus = async (status?: string) =>
    names(await search({ q: token, ...(status ? { status } : {}) }))
      .map((n) => n.replace(`${token} `, ""))
      .sort();

  test("BR-REC-57 without a status the list holds every non-archived member and no archived one (the All chip)", async () => {
    expect(await withStatus()).toEqual(
      [...ALL_ACTIVE, ...EXPIRING_14, ...EXPIRED].sort(),
    );
  });

  test("BR-REC-57 status=active: only Active members (a membership that has not started yet counts as Active)", async () => {
    expect(await withStatus("active")).toEqual([...ALL_ACTIVE].sort());
  });

  test("BR-REC-52 status=expiring: ends within the lead days, ending today counts, 14 days left counts with lead 14", async () => {
    expect(await withStatus("expiring")).toEqual([...EXPIRING_14].sort());
  });

  test("BR-REC-52 status=expired: ended before today", async () => {
    expect(await withStatus("expired")).toEqual([...EXPIRED].sort());
  });

  test("BR-REC-57 status=archived: only archived members, whatever their membership", async () => {
    expect(await withStatus("archived")).toEqual([...ARCHIVED].sort());
  });

  test("BR-REC-57 status=any: everyone, archived too", async () => {
    expect(await withStatus("any")).toEqual(
      [...ALL_ACTIVE, ...EXPIRING_14, ...EXPIRED, ...ARCHIVED].sort(),
    );
  });

  test("BR-REC-06 / 57 search text under the Archived chip looks only at archived members", async () => {
    expect(
      names(await search({ q: `${token} Archived`, status: "archived" }))
        .length,
    ).toBe(2);
    // the same text without the chip finds none of them
    expect(names(await search({ q: `${token} Archived` }))).toEqual([]);
    // and text that only matches a non-archived member finds nothing under the chip
    expect(
      names(await search({ q: `${token} Active`, status: "archived" })),
    ).toEqual([]);
  });

  test("BR-REC-52 every item's membership.status is the one the chip asked for", async () => {
    for (const status of ["active", "expiring", "expired"] as const) {
      const items = mine(await search({ q: token, status }));
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) expect(item.membership.status).toBe(status);
    }
  });

  test("BR-REC-52 daysLeft is the days from today to the end date: 0 ends today, negative is ended", async () => {
    const items = mine(await search({ q: token }));
    const daysLeft = (label: string) =>
      items.find((i) => i.fullName === `${token} ${label} ${MARK}`)?.membership
        .daysLeft;
    expect(daysLeft("Expiring7")).toBe(7);
    expect(daysLeft("Expiring0")).toBe(0);
    expect(daysLeft("Expired1")).toBe(-1);
    expect(daysLeft("Expired100")).toBe(-100);
    expect(daysLeft("Active")).toBe(264);
  });

  test("BR-REC-52 / 08 the lead days come from the settings: with 3 lead days, ending in 3 days is Ends soon and in 4 days is Active", async () => {
    try {
      await s.setSettings({ expiryLeadDays: 3 });
      expect(await withStatus("expiring")).toEqual(["Edge3", "Expiring0"]);
      const active = await withStatus("active");
      expect(active).toEqual(
        [...ALL_ACTIVE, "Edge14", "Edge4", "Expiring7"].sort(),
      );
      const items = mine(await search({ q: token }));
      expect(
        items.find((i) => i.fullName === `${token} Edge4 ${MARK}`)?.membership
          .status,
      ).toBe("active");
    } finally {
      await s.setSettings({ expiryLeadDays: 14 });
    }
    // back to the default of 14
    expect(await withStatus("expiring")).toEqual([...EXPIRING_14].sort());
  });

  test("BR-REC-52 the status comes from the latest period: renewed early (the next period exists) is Active, not Ends soon", async () => {
    await s.seedMember({
      name: "Zrenew Early",
      periods: [
        { plan: "monthly", startOn: s.day(-25), endOn: s.day(4) },
        { plan: "annual", startOn: s.day(5), endOn: s.day(369) },
      ],
    });
    const items = mine(await search({ q: "zrenew early" }));
    expect(items).toHaveLength(1);
    expect(items[0]?.membership).toMatchObject({
      status: "active",
      plan: "annual",
      endOn: s.day(369),
    });
    const expiring = await search({ q: "zrenew early", status: "expiring" });
    expect(mine(expiring)).toEqual([]);
  });

  test("BR-REC-52 a member whose latest period (by start) ended is Ended even if an older period stored later is longer", async () => {
    await s.seedMember({
      name: "Zlatest Ended",
      periods: [
        { plan: "monthly", startOn: s.day(-40), endOn: s.day(-11) },
        { plan: "annual", startOn: s.day(-500), endOn: s.day(-136) },
      ],
    });
    const items = mine(await search({ q: "zlatest ended" }));
    expect(items[0]?.membership).toMatchObject({
      status: "expired",
      plan: "monthly",
      endOn: s.day(-11),
    });
  });

  test("BR-REC-157 a status outside the five is 400 VALIDATION_ERROR", async () => {
    expectError(await s.list({ status: "weird" }), 400, "VALIDATION_ERROR");
  });
});

describe("E16 other sort orders (BR-REC-155)", () => {
  // joined and last assessed:  A -300 / -5;  B -200 / -20;  D -200 / never;  C -100 / never
  beforeAll(async () => {
    await s.seedMember({
      name: "Zsort A",
      joinedOn: s.day(-300),
      assessedOn: [s.day(-5)],
    });
    await s.seedMember({
      name: "Zsort B",
      joinedOn: s.day(-200),
      assessedOn: [s.day(-50), s.day(-20)],
    });
    await s.seedMember({ name: "Zsort C", joinedOn: s.day(-100) });
    await s.seedMember({ name: "Zsort D", joinedOn: s.day(-200) });
  });

  const order = async (query: Record<string, string>) =>
    names(await search({ q: "Zsort", ...query })).map((n) =>
      n.replace("Zsort ", ""),
    );

  test("BR-REC-155 the default is the name, A to Z", async () => {
    expect(await order({})).toEqual(["A", "B", "C", "D"]);
  });

  test("BR-REC-155 sortDir=desc on the name is Z to A", async () => {
    expect(await order({ sortDir: "desc" })).toEqual(["D", "C", "B", "A"]);
  });

  test("BR-REC-155 sortBy=joinedOn ascending: oldest join first, a tie broken by name", async () => {
    expect(await order({ sortBy: "joinedOn", sortDir: "asc" })).toEqual([
      "A",
      "B",
      "D",
      "C",
    ]);
  });

  test("BR-REC-155 sortBy=joinedOn descending: newest join first", async () => {
    const result = await order({ sortBy: "joinedOn", sortDir: "desc" });
    expect(result[0]).toBe("C");
    expect(result[3]).toBe("A");
    expect(result.slice(1, 3).sort()).toEqual(["B", "D"]);
  });

  test("BR-REC-155 sortBy=lastAssessedOn ascending: oldest assessment first, never assessed last, a tie by name", async () => {
    expect(await order({ sortBy: "lastAssessedOn", sortDir: "asc" })).toEqual([
      "B",
      "A",
      "C",
      "D",
    ]);
  });

  test("BR-REC-155 sortBy=lastAssessedOn descending: newest assessment first, never assessed still last", async () => {
    const result = await order({ sortBy: "lastAssessedOn", sortDir: "desc" });
    expect(result.slice(0, 2)).toEqual(["A", "B"]);
    expect(result.slice(2).sort()).toEqual(["C", "D"]);
  });

  test("BR-REC-07 lastAssessedOn is the latest assessment day of the member", async () => {
    const items = mine(await search({ q: "Zsort" }));
    const last = (label: string) =>
      items.find((i) => i.fullName === `Zsort ${label} ${MARK}`)
        ?.lastAssessedOn;
    expect(last("A")).toBe(s.day(-5));
    expect(last("B")).toBe(s.day(-20));
    expect(last("C")).toBeNull();
  });

  test("BR-REC-155 a sort field outside name, joinedOn and lastAssessedOn is 400", async () => {
    for (const sortBy of ["phone", "id", "archivedAt"]) {
      expectError(await s.list({ sortBy }), 400, "VALIDATION_ERROR");
    }
  });
});

describe("E16 the plain list: no search text (BR-REC-57)", () => {
  test("BR-REC-57 non-archived members A to Z, ignoring case, and no archived member", async () => {
    await s.seedMember({ name: "zdefault bravo" });
    await s.seedMember({ name: "Zdefault Alpha" });
    await s.seedMember({ name: "ZDEFAULT charlie" });
    await s.seedMember({ name: "Zdefault Archived", archived: true });
    const items = await s.listAll();
    const ours = mine(items)
      .map((i) => bare(i.fullName))
      .filter((n) => n.toLowerCase().includes("zdefault"));
    expect(ours).toEqual([
      "Zdefault Alpha",
      "zdefault bravo",
      "ZDEFAULT charlie",
    ]);
  });

  test("BR-REC-57 the whole plain list holds no archived member, and this suite's members come A to Z ignoring case", async () => {
    const items = await s.listAll();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.archivedAt).toBeNull();
    // only names made of letters, digits and spaces: punctuation sorts differently per collation
    const ours = mine(items)
      .map((i) => bare(i.fullName).toLowerCase())
      .filter((n) => /^[a-z0-9 ]+$/.test(n));
    expect(ours.length).toBeGreaterThan(3);
    expect(ours).toEqual(
      [...ours].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  test("BR-REC-57 the plain list shows the name, phone and last assessment of each row", async () => {
    const m = await s.seedMember({
      name: "Zplain Row",
      assessedOn: [s.day(-3)],
    });
    const items = await s.listAll();
    const row = items.find((i) => i.id === m.id);
    expect(row).toMatchObject({
      fullName: m.fullName,
      lastAssessedOn: s.day(-3),
      archivedAt: null,
    });
  });
});

describe("E16 paging and envelope (BR-REC-155, 154)", () => {
  const token = "Zpage";
  beforeAll(async () => {
    for (const n of [1, 2, 3, 4, 5])
      await s.seedMember({ name: `${token} ${n}` });
  });

  const page = async (query: Record<string, string | number>) => {
    const reply = await s.list({ q: token, ...query });
    expect(reply.status).toBe(200);
    return reply.body as unknown as {
      success: boolean;
      data: ListItem[];
      meta: Record<string, number>;
    };
  };

  test("BR-REC-155 pageSize 2: pages of 2, 2 and 1, with meta { page, pageSize, total, totalPages }", async () => {
    const one = await page({ page: 1, pageSize: 2 });
    const two = await page({ page: 2, pageSize: 2 });
    const three = await page({ page: 3, pageSize: 2 });
    expect(names(one.data)).toEqual([`${token} 1`, `${token} 2`]);
    expect(names(two.data)).toEqual([`${token} 3`, `${token} 4`]);
    expect(names(three.data)).toEqual([`${token} 5`]);
    expect(one.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
    expect(two.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
    expect(three.meta).toEqual({
      page: 3,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });

  test("BR-REC-155 a page past the end is empty data, with the same totals", async () => {
    const past = await page({ page: 4, pageSize: 2 });
    expect(past.success).toBe(true);
    expect(past.data).toEqual([]);
    expect(past.meta).toEqual({
      page: 4,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
  });

  test("BR-REC-155 the default is page 1 with 10 per page", async () => {
    const result = await page({});
    expect(result.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 5,
      totalPages: 1,
    });
    expect(result.data).toHaveLength(5);
  });

  test("BR-REC-155 25 per page (what the screens ask for) is accepted", async () => {
    const result = await page({ pageSize: 25 });
    expect(result.meta).toMatchObject({
      pageSize: 25,
      total: 5,
      totalPages: 1,
    });
  });

  test("BR-REC-155 a list with no rows still has totalPages 1", async () => {
    const reply = await s.list({ q: "qqnomatchzz" });
    const body = reply.body as unknown as { meta: Record<string, number> };
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 1,
    });
  });

  test("BR-REC-155 walking the pages one by one gives the same members as one big page, without repeats", async () => {
    const seen: string[] = [];
    for (let n = 1; n <= 3; n++) {
      const result = await page({ page: n, pageSize: 2 });
      seen.push(...result.data.map((i) => i.id));
    }
    const all = (await page({ pageSize: 100 })).data.map((i) => i.id);
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test("BR-REC-154 success is { success: true, data, meta } with status 200", async () => {
    const result = await page({});
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.meta).toBeDefined();
  });
});
