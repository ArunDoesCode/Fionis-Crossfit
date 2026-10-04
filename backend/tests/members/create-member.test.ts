import { describe, expect, test } from "bun:test";

import {
  addDays,
  ageOnDay,
  dataOf,
  daysBetween,
  endOf,
  expectError,
  expectMemberShape,
  MARK,
  type MemberView,
  nextPhone,
  type PlanName,
  startFor,
  statusOracle,
  todayIn,
  useMembersSuite,
} from "./support/suite";

// E17 POST /api/members: add a member with the first membership period.
// BR-REC-03, 04, 05, 45, 46, 48, 49, 50 (API part), 51, 154, 156, 158.

const s = useMembersSuite();

let nameCounter = 0;
/** A name nobody else has, so "was a member created?" can be answered by name. */
const uniqueName = (label: string) => {
  nameCounter += 1;
  return `${label} ${nameCounter} ${MARK}`;
};

/** A null `before`, or one whose every field is null: the row says "nothing before". */
function expectNothingBefore(before: Record<string, unknown> | null) {
  if (before === null) return;
  for (const value of Object.values(before)) expect(value ?? null).toBeNull();
}

describe("E17 a member and the first membership in one go (BR-REC-03, 05)", () => {
  test("BR-REC-03 / 05 a complete body answers 201 with the member as E18 shows it", async () => {
    const today = s.today();
    const startOn = s.day(-100);
    const fullName = uniqueName("Surya Pratap");
    const phone = nextPhone();
    const reply = await s.createMember({
      fullName,
      phone,
      dateOfBirth: "1982-05-10",
      sex: "male",
      joinedOn: startOn,
      firstPeriod: { plan: "annual", startOn },
    });
    const member = dataOf<MemberView>(reply, 201);
    const endOn = endOf("annual", startOn);
    const expected = statusOracle({ startOn, endOn }, today, 14);

    expect(member.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(member).toMatchObject({
      fullName,
      phone,
      email: null,
      dateOfBirth: "1982-05-10",
      age: ageOnDay("1982-05-10", today),
      sex: "male",
      joinedOn: startOn,
      objective: null,
      notes: null,
      archivedAt: null,
      membership: {
        status: expected.status,
        plan: "annual",
        startOn,
        endOn,
        daysLeft: expected.daysLeft,
      },
    });
    expect(member.periods).toHaveLength(1);
    expect(member.periods[0]).toMatchObject({
      plan: "annual",
      startOn,
      endOn,
    });
    expect(member.periods[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("BR-REC-03 the optional email, objective and notes are stored when sent", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Anita Rao"),
      email: "anita@example.com",
      objective: "fat_loss",
      notes: "Left knee, go easy on squats",
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.email).toBe("anita@example.com");
    expect(member.objective).toBe("fat_loss");
    expect(member.notes).toBe("Left knee, go easy on squats");
    const stored = await s.memberRow(member.id);
    expect(stored).toMatchObject({
      email: "anita@example.com",
      objective: "fat_loss",
      notes: "Left knee, go easy on squats",
    });
  });

  test("BR-REC-05 a start date in the past is allowed (historical entry): joined 2025-06-01, annual, ends 2026-05-31", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Old Binder"),
      joinedOn: "2025-06-01",
      firstPeriod: { plan: "annual", startOn: "2025-06-01" },
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.membership).toMatchObject({
      plan: "annual",
      startOn: "2025-06-01",
      endOn: "2026-05-31",
    });
    // 2026-05-31 is before today (the tests run after it): the membership has ended
    expect(member.membership.status).toBe("expired");
    expect(member.membership.daysLeft).toBe(
      daysBetween(s.today(), "2026-05-31"),
    );
  });

  test("BR-REC-05 the member row and its first period are both stored", async () => {
    const reply = await s.createMember({ fullName: uniqueName("Both Rows") });
    const member = dataOf<MemberView>(reply, 201);
    const stored = await s.memberRow(member.id);
    expect(stored?.fullName).toBe(member.fullName);
    const periods = await s.periodRows(member.id);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({
      plan: "annual",
      startOn: "2025-06-01",
      endOn: "2026-05-31",
    });
  });

  test("BR-REC-05 a body without firstPeriod is 400 VALIDATION_ERROR and nothing is stored", async () => {
    const fullName = uniqueName("No First Period");
    const body = s.memberBody({ fullName });
    delete body.firstPeriod;
    const reply = await s.send("POST", "/api/members", {
      body,
      key: crypto.randomUUID(),
    });
    expectError(reply, 400, "VALIDATION_ERROR");
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-05 / 50 the first membership has no default plan: a first period without plan is 400", async () => {
    const fullName = uniqueName("No Plan");
    const reply = await s.createMember({
      fullName,
      firstPeriod: { startOn: "2025-06-01" },
    });
    expectError(reply, 400, "VALIDATION_ERROR");
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-05 a first period without a start date is 400", async () => {
    const fullName = uniqueName("No Start");
    const reply = await s.createMember({
      fullName,
      firstPeriod: { plan: "annual" },
    });
    expectError(reply, 400, "VALIDATION_ERROR");
    expect(await s.memberCountByName(fullName)).toBe(0);
  });
});

describe("E17 BR-REC-08 / 51 the end date of the first period (spec table)", () => {
  const CASES: [PlanName, string, string][] = [
    ["monthly", "2026-01-15", "2026-02-14"],
    ["quarterly", "2026-03-01", "2026-05-31"],
    ["half_annual", "2026-04-10", "2026-10-09"],
    ["annual", "2025-06-01", "2026-05-31"],
    ["monthly", "2026-01-31", "2026-02-28"],
    ["monthly", "2026-02-28", "2026-03-27"],
  ];
  for (const [plan, startOn, endOn] of CASES) {
    test(`BR-REC-51 ${plan} from ${startOn} ends ${endOn}`, async () => {
      const reply = await s.createMember({
        fullName: uniqueName(`Plan ${plan}`),
        joinedOn: startOn,
        firstPeriod: { plan, startOn },
      });
      const member = dataOf<MemberView>(reply, 201);
      expect(member.membership).toMatchObject({ plan, startOn, endOn });
      expect(member.periods[0]).toMatchObject({ plan, startOn, endOn });
    });
  }

  test("BR-REC-08 the four plans are 1, 3, 6 and 12 calendar months", async () => {
    const ends: Record<string, string> = {};
    for (const plan of ["monthly", "quarterly", "half_annual", "annual"]) {
      const reply = await s.createMember({
        fullName: uniqueName(`Months ${plan}`),
        joinedOn: "2025-01-01",
        firstPeriod: { plan, startOn: "2025-01-01" },
      });
      ends[plan] = dataOf<MemberView>(reply, 201).membership.endOn;
    }
    expect(ends).toEqual({
      monthly: "2025-01-31",
      quarterly: "2025-03-31",
      half_annual: "2025-06-30",
      annual: "2025-12-31",
    });
  });

  test("BR-REC-08 a plan outside the four is 400", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Weekly"),
      firstPeriod: { plan: "weekly", startOn: "2025-06-01" },
    });
    expectError(reply, 400, "VALIDATION_ERROR");
  });
});

describe("E17 required and invalid fields (BR-REC-03, 45, 46, 49)", () => {
  for (const field of ["fullName", "phone", "dateOfBirth", "sex", "joinedOn"]) {
    test(`BR-REC-03 a body without ${field} is 400 VALIDATION_ERROR, and the issue names ${field}`, async () => {
      const body = s.memberBody({ fullName: uniqueName(`Missing ${field}`) });
      delete body[field];
      const reply = await s.send("POST", "/api/members", {
        body,
        key: crypto.randomUUID(),
      });
      expectError(reply, 400, "VALIDATION_ERROR");
      const issues = (reply.body?.details?.issues ?? []) as { path: string }[];
      expect(issues.some((i) => String(i.path).includes(field))).toBe(true);
    });
  }

  test("BR-REC-03 / 134 an empty phone is 400", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Empty Phone"),
      phone: "",
    });
    expectError(reply, 400, "VALIDATION_ERROR");
  });

  const BAD: [string, Record<string, unknown>][] = [
    ["BR-REC-49 sex other", { sex: "other" }],
    ["BR-REC-49 sex empty", { sex: "" }],
    ["BR-REC-45 name of one character", { fullName: "S" }],
    ["BR-REC-45 name of spaces", { fullName: "    " }],
    ["BR-REC-45 name of 81 characters", { fullName: "a".repeat(81) }],
    ["BR-REC-46 phone of 9 digits", { phone: "984501234" }],
    ["BR-REC-46 phone of 16 digits", { phone: "9845012345678901" }],
    ["BR-REC-46 phone with letters", { phone: "98450abcde" }],
    ["BR-REC-45 email that is not an email", { email: "surya" }],
    ["BR-REC-45 notes of 1,001 characters", { notes: "n".repeat(1001) }],
    ["BR-REC-03 objective outside the four", { objective: "cardio" }],
    [
      "BR-REC-153 date of birth that is not a day",
      { dateOfBirth: "1982-02-30" },
    ],
    ["BR-REC-153 join date in the wrong format", { joinedOn: "01-06-2025" }],
    [
      "BR-REC-153 first period start in the wrong format",
      { firstPeriod: { plan: "annual", startOn: "2025/06/01" } },
    ],
  ];
  for (const [label, overrides] of BAD) {
    test(`${label} is 400 VALIDATION_ERROR`, async () => {
      const reply = await s.createMember({
        fullName: uniqueName("Bad Field"),
        ...overrides,
      });
      expectError(reply, 400, "VALIDATION_ERROR");
    });
  }

  test("BR-REC-45 the name comes back trimmed and with double spaces collapsed", async () => {
    const reply = await s.createMember({
      fullName: `  Surya   Pratap  ${MARK} `,
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.fullName).toBe(`Surya Pratap ${MARK}`);
    expect((await s.memberRow(member.id))?.fullName).toBe(
      `Surya Pratap ${MARK}`,
    );
  });

  test("BR-REC-45 a name of 2 characters and one of exactly 80 are accepted", async () => {
    const two = await s.createMember({ fullName: "Su" });
    expect(dataOf<MemberView>(two, 201).fullName).toBe("Su");
    const eighty = `${"b".repeat(80 - MARK.length - 1)} ${MARK}`;
    expect(eighty).toHaveLength(80);
    const long = await s.createMember({ fullName: eighty });
    expect(dataOf<MemberView>(long, 201).fullName).toBe(eighty);
  });

  test("BR-REC-45 an email is trimmed and an empty one means none", async () => {
    const withSpaces = await s.createMember({
      fullName: uniqueName("Email Spaces"),
      email: "  surya@example.com ",
    });
    expect(dataOf<MemberView>(withSpaces, 201).email).toBe("surya@example.com");
    const empty = await s.createMember({
      fullName: uniqueName("Email Empty"),
      email: "",
    });
    expect(dataOf<MemberView>(empty, 201).email).toBeNull();
    const blank = await s.createMember({
      fullName: uniqueName("Email Blank"),
      email: "   ",
    });
    expect(dataOf<MemberView>(blank, 201).email).toBeNull();
  });

  test("BR-REC-45 notes of exactly 1,000 characters are accepted; empty notes mean none", async () => {
    const full = await s.createMember({
      fullName: uniqueName("Notes Max"),
      notes: "n".repeat(1000),
    });
    expect(dataOf<MemberView>(full, 201).notes).toBe("n".repeat(1000));
    const empty = await s.createMember({
      fullName: uniqueName("Notes Empty"),
      notes: "  ",
    });
    expect(dataOf<MemberView>(empty, 201).notes).toBeNull();
  });

  test('BR-REC-46 "+91 98450-12345" is stored and returned as +919845012345; phone_digits holds 919845012345', async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Phone Clean"),
      phone: "+91 98450-12345",
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.phone).toBe("+919845012345");
    const stored = await s.memberRow(member.id);
    expect(stored?.phone).toBe("+919845012345");
    expect(stored?.phoneDigits).toBe("919845012345");
  });

  test('BR-REC-46 a phone with brackets and dashes "(98450) 12-345" is stored as 9845012345', async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Phone Brackets"),
      phone: "(98450) 12-345",
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.phone).toBe("9845012345");
    expect((await s.memberRow(member.id))?.phoneDigits).toBe("9845012345");
  });

  test("BR-REC-49 male and female are accepted", async () => {
    for (const sex of ["male", "female"] as const) {
      const reply = await s.createMember({
        fullName: uniqueName(`Sex ${sex}`),
        sex,
      });
      expect(dataOf<MemberView>(reply, 201).sex).toBe(sex);
    }
  });
});

describe("E17 duplicates are allowed (BR-REC-04)", () => {
  test("BR-REC-04 two members with the same name but different phones are both saved", async () => {
    const fullName = uniqueName("Surya Pratap");
    const a = await s.createMember({ fullName, phone: nextPhone() });
    const b = await s.createMember({ fullName, phone: nextPhone() });
    const first = dataOf<MemberView>(a, 201);
    const second = dataOf<MemberView>(b, 201);
    expect(first.id).not.toBe(second.id);
    expect(await s.memberCountByName(fullName)).toBe(2);
  });

  test("BR-REC-04 a phone that another member already has is not refused: 201 and both exist", async () => {
    const phone = nextPhone();
    const a = await s.createMember({
      fullName: uniqueName("Anita Rao"),
      phone,
    });
    const b = await s.createMember({
      fullName: uniqueName("Rao Family"),
      phone,
    });
    const first = dataOf<MemberView>(a, 201);
    const second = dataOf<MemberView>(b, 201);
    expect(first.id).not.toBe(second.id);
    expect(second.phone).toBe(phone);
  });

  test("BR-REC-04 / 46 the same phone written another way (+91 prefix, spaces) is also not refused", async () => {
    const phone = nextPhone();
    const a = await s.createMember({ fullName: uniqueName("First"), phone });
    const b = await s.createMember({
      fullName: uniqueName("Second"),
      phone: `+91 ${phone.slice(0, 5)}-${phone.slice(5)}`,
    });
    dataOf<MemberView>(a, 201);
    dataOf<MemberView>(b, 201);
  });
});

describe("E17 dates (BR-REC-48, 50)", () => {
  test("BR-REC-48 a date of birth in the future is 400 DATE_IN_FUTURE with details.field dateOfBirth", async () => {
    const fullName = uniqueName("Future Birth");
    const reply = await s.createMember({
      fullName,
      dateOfBirth: s.day(1),
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "dateOfBirth" });
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-48 a date of birth of 2030-01-01 is 400 DATE_IN_FUTURE", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Future 2030"),
      dateOfBirth: "2030-01-01",
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
  });

  test("BR-REC-48 a join date in the future is 400 DATE_IN_FUTURE with details.field joinedOn", async () => {
    const fullName = uniqueName("Future Join");
    const reply = await s.createMember({
      fullName,
      joinedOn: s.day(1),
      firstPeriod: { plan: "monthly", startOn: s.day(1) },
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "joinedOn" });
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-48 when both are in the future, the date of birth is reported first", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Both Future"),
      dateOfBirth: s.day(5),
      joinedOn: s.day(3),
      firstPeriod: { plan: "monthly", startOn: s.day(3) },
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "dateOfBirth" });
  });

  test("BR-REC-48 today is not the future: a baby born today who joined today is saved", async () => {
    const today = s.today();
    const reply = await s.createMember({
      fullName: uniqueName("Born Today"),
      dateOfBirth: today,
      joinedOn: today,
      firstPeriod: { plan: "monthly", startOn: today },
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.age).toBe(0);
  });

  test("BR-REC-48 a date of birth in 1920 is saved (the form only warns): age over 100", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Born 1920"),
      dateOfBirth: "1920-01-01",
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.age).toBe(ageOnDay("1920-01-01", s.today()));
    expect(member.age).toBeGreaterThan(100);
  });

  test("BR-REC-48 a very young member (age under 10) is saved too", async () => {
    const dob = s.day(-365 * 5);
    const reply = await s.createMember({
      fullName: uniqueName("Young"),
      dateOfBirth: dob,
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.age).toBe(ageOnDay(dob, s.today()));
    expect(member.age).toBeLessThan(10);
  });

  test("BR-REC-03 age is computed from the date of birth: on the 30th birthday it is 30, the day before the birthday it is 29", async () => {
    const today = s.today();
    const [y, m, rawDay] = today.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const d = m === 2 && rawDay === 29 ? 28 : rawDay; // no 29 Feb thirty years ago
    const pad = (n: number) => String(n).padStart(2, "0");
    const birthday = `${y - 30}-${pad(m)}-${pad(d)}`;
    const onBirthday = await s.createMember({
      fullName: uniqueName("Birthday Today"),
      dateOfBirth: birthday,
    });
    expect(dataOf<MemberView>(onBirthday, 201).age).toBe(30);
    // born one day later: the 30th birthday is tomorrow, so still 29 today
    const bornNextDay = addDays(birthday, 1);
    const beforeBirthday = await s.createMember({
      fullName: uniqueName("Birthday Tomorrow"),
      dateOfBirth: bornNextDay,
    });
    expect(dataOf<MemberView>(beforeBirthday, 201).age).toBe(29);
  });

  test("BR-REC-50 a start before the join date is 400 START_BEFORE_JOIN and nothing is stored", async () => {
    const fullName = uniqueName("Start Early");
    const reply = await s.createMember({
      fullName,
      joinedOn: "2025-06-01",
      firstPeriod: { plan: "annual", startOn: "2025-05-20" },
    });
    expectError(reply, 400, "START_BEFORE_JOIN");
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-50 a start one day before the join date is refused, the same day and one day after are accepted", async () => {
    const early = await s.createMember({
      fullName: uniqueName("One Day Early"),
      joinedOn: "2025-06-10",
      firstPeriod: { plan: "monthly", startOn: "2025-06-09" },
    });
    expectError(early, 400, "START_BEFORE_JOIN");
    const same = await s.createMember({
      fullName: uniqueName("Same Day"),
      joinedOn: "2025-06-10",
      firstPeriod: { plan: "monthly", startOn: "2025-06-10" },
    });
    dataOf<MemberView>(same, 201);
    const later = await s.createMember({
      fullName: uniqueName("Next Day"),
      joinedOn: "2025-06-10",
      firstPeriod: { plan: "monthly", startOn: "2025-06-11" },
    });
    dataOf<MemberView>(later, 201);
  });

  test("BR-REC-50 DATE_IN_FUTURE is answered before START_BEFORE_JOIN", async () => {
    const reply = await s.createMember({
      fullName: uniqueName("Future Then Start"),
      joinedOn: s.day(2),
      firstPeriod: { plan: "monthly", startOn: s.day(1) },
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
  });

  test("BR-REC-48 the gym's time zone decides what 'today' is: a day that is tomorrow in one zone is today in another", async () => {
    // Pacific/Kiritimati is UTC+14 and Pacific/Pago_Pago is UTC-11: at any moment the
    // first one's date is at least a day ahead of the second one's.
    const ahead = todayIn("Pacific/Kiritimati");
    const behind = todayIn("Pacific/Pago_Pago");
    expect(ahead > behind).toBe(true);
    try {
      await s.setSettings({ timezone: "Pacific/Pago_Pago" });
      const refused = await s.createMember({
        fullName: uniqueName("Zone Behind"),
        joinedOn: ahead,
        firstPeriod: { plan: "monthly", startOn: ahead },
      });
      expectError(refused, 400, "DATE_IN_FUTURE");
      expect(refused.body?.details).toMatchObject({ field: "joinedOn" });

      await s.setSettings({ timezone: "Pacific/Kiritimati" });
      const accepted = await s.createMember({
        fullName: uniqueName("Zone Ahead"),
        joinedOn: ahead,
        firstPeriod: { plan: "monthly", startOn: ahead },
      });
      dataOf<MemberView>(accepted, 201);
    } finally {
      await s.setSettings({ timezone: "Asia/Kolkata" });
    }
  });
});

describe("E17 membership status of the first period (BR-REC-52)", () => {
  test("BR-REC-52 a first period that ends in 7 days is Ends soon with 7 days left", async () => {
    const endOn = s.day(7);
    const startOn = startFor("monthly", endOn);
    const reply = await s.createMember({
      fullName: uniqueName("Ends In Seven"),
      joinedOn: startOn,
      firstPeriod: { plan: "monthly", startOn },
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.membership).toMatchObject({
      status: "expiring",
      endOn,
      daysLeft: 7,
    });
  });

  test("BR-REC-52 a first period that ended yesterday is Ended with -1 days left", async () => {
    const endOn = s.day(-1);
    const startOn = startFor("monthly", endOn);
    const reply = await s.createMember({
      fullName: uniqueName("Ended Yesterday"),
      joinedOn: startOn,
      firstPeriod: { plan: "monthly", startOn },
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.membership).toMatchObject({
      status: "expired",
      endOn,
      daysLeft: -1,
    });
  });

  test("BR-REC-52 a first period that has not started yet is Active, however close its end", async () => {
    const startOn = s.day(3);
    const reply = await s.createMember({
      fullName: uniqueName("Starts Later"),
      joinedOn: s.today(),
      firstPeriod: { plan: "monthly", startOn },
    });
    const member = dataOf<MemberView>(reply, 201);
    expect(member.membership.status).toBe("active");
    expect(member.membership.startOn).toBe(startOn);
  });
});

describe("E17 change log and transaction (BR-REC-158)", () => {
  test("BR-REC-158 a create writes member.create and membership.create, with this sign-in as the session", async () => {
    const fullName = uniqueName("Audited");
    const reply = await s.createMember({
      fullName,
      phone: "+91 98450-12345",
      dateOfBirth: "1982-05-10",
      sex: "female",
      joinedOn: "2025-06-01",
      firstPeriod: { plan: "quarterly", startOn: "2025-06-01" },
    });
    const member = dataOf<MemberView>(reply, 201);
    const period = member.periods[0];
    const rows = await s.auditAbout(member.id, period ? [period.id] : []);
    expect(rows.map((r) => r.action).sort()).toEqual([
      "member.create",
      "membership.create",
    ]);
    for (const row of rows) expect(row.sessionId).toBe(s.sessionId);

    const memberRow = rows.find((r) => r.action === "member.create");
    expect(memberRow?.entity).toBe("member");
    expect(memberRow?.entityId).toBe(member.id);
    expectNothingBefore(memberRow?.before ?? null);
    expect(memberRow?.after).toMatchObject({
      fullName,
      phone: "+919845012345",
      dateOfBirth: "1982-05-10",
      sex: "female",
      joinedOn: "2025-06-01",
    });

    const periodRow = rows.find((r) => r.action === "membership.create");
    expect(periodRow?.entity).toBe("membership_period");
    expect(periodRow?.entityId).toBe(period?.id);
    expectNothingBefore(periodRow?.before ?? null);
    expect(periodRow?.after).toEqual({
      memberId: member.id,
      plan: "quarterly",
      startOn: "2025-06-01",
      endOn: "2025-08-31",
    });
  });

  test("BR-REC-158 a refused create (START_BEFORE_JOIN) leaves no member, no period and no change-log row", async () => {
    const before = (await s.audit()).length;
    const fullName = uniqueName("Refused");
    const reply = await s.createMember({
      fullName,
      joinedOn: "2025-06-01",
      firstPeriod: { plan: "annual", startOn: "2025-05-01" },
    });
    expectError(reply, 400, "START_BEFORE_JOIN");
    expect(await s.memberCountByName(fullName)).toBe(0);
    expect((await s.audit()).length).toBe(before);
  });

  test("BR-REC-158 a refused create (DATE_IN_FUTURE) leaves no change-log row either", async () => {
    const before = (await s.audit()).length;
    const reply = await s.createMember({
      fullName: uniqueName("Refused Future"),
      dateOfBirth: s.day(10),
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect((await s.audit()).length).toBe(before);
  });
});

describe("E17 Idempotency-Key (BR-REC-156)", () => {
  test("BR-REC-156 without the header: 400 IDEMPOTENCY_KEY_MISSING and nothing is stored", async () => {
    const fullName = uniqueName("No Key");
    const reply = await s.createMember({ fullName }, null);
    expectError(reply, 400, "IDEMPOTENCY_KEY_MISSING");
    expect(await s.memberCountByName(fullName)).toBe(0);
  });

  test("BR-REC-156 phone loses signal after Save, retries with the same key and body: one member, the first answer comes back", async () => {
    const fullName = uniqueName("Retry");
    const key = crypto.randomUUID();
    const body = { fullName, phone: nextPhone() };
    const first = await s.createMember(body, key);
    const retry = await s.createMember(body, key);
    const created = dataOf<MemberView>(first, 201);
    expect(retry.status).toBe(201);
    expect(retry.body).toEqual(first.body);
    expect(await s.memberCountByName(fullName)).toBe(1);
    expect(dataOf<MemberView>(retry, 201).id).toBe(created.id);
    // the change log has one create, not two
    const rows = await s.auditAbout(created.id);
    expect(rows.filter((r) => r.action === "member.create")).toHaveLength(1);
  });

  test("BR-REC-156 the same key with a different body is 422 IDEMPOTENCY_KEY_REUSED and creates nothing", async () => {
    const key = crypto.randomUUID();
    const first = await s.createMember(
      { fullName: uniqueName("Key Owner"), phone: nextPhone() },
      key,
    );
    dataOf<MemberView>(first, 201);
    const otherName = uniqueName("Key Thief");
    const reused = await s.createMember(
      { fullName: otherName, phone: nextPhone() },
      key,
    );
    expectError(reused, 422, "IDEMPOTENCY_KEY_REUSED");
    expect(await s.memberCountByName(otherName)).toBe(0);
  });

  test("BR-REC-156 a request that failed frees its key: the corrected retry with the same key creates the member", async () => {
    const key = crypto.randomUUID();
    const fullName = uniqueName("Fix And Retry");
    const bad = await s.createMember(
      {
        fullName,
        joinedOn: "2025-06-01",
        firstPeriod: { plan: "annual", startOn: "2025-05-01" },
      },
      key,
    );
    expectError(bad, 400, "START_BEFORE_JOIN");
    const fixed = await s.createMember(
      {
        fullName,
        joinedOn: "2025-06-01",
        firstPeriod: { plan: "annual", startOn: "2025-06-01" },
      },
      key,
    );
    dataOf<MemberView>(fixed, 201);
    expect(await s.memberCountByName(fullName)).toBe(1);
  });

  test("BR-REC-156 four identical requests sent at the same moment create one member and all get the same answer", async () => {
    const fullName = uniqueName("Parallel Retry");
    const key = crypto.randomUUID();
    const body = { fullName, phone: nextPhone() };
    const replies = await Promise.all(
      Array.from({ length: 4 }, () => s.createMember(body, key)),
    );
    for (const reply of replies) expect(reply.status).toBe(201);
    const ids = new Set(replies.map((r) => dataOf<MemberView>(r, 201).id));
    expect(ids.size).toBe(1);
    expect(await s.memberCountByName(fullName)).toBe(1);
  });

  test("BR-REC-156 different keys with the same body are two requests: two members (BR-REC-04)", async () => {
    const fullName = uniqueName("Two Keys");
    const phone = nextPhone();
    const a = await s.createMember({ fullName, phone });
    const b = await s.createMember({ fullName, phone });
    dataOf<MemberView>(a, 201);
    dataOf<MemberView>(b, 201);
    expect(await s.memberCountByName(fullName)).toBe(2);
  });
});

describe("E17 the answer is the member as E18 shows it", () => {
  test("BR-REC-03 / 59 the 201 body has exactly the E18 fields, with the membership and the one period", async () => {
    const reply = await s.createMember({ fullName: uniqueName("Shape") });
    const member = dataOf<MemberView>(reply, 201);
    expectMemberShape(member);
    expect(member.periods).toHaveLength(1);
    // the same member read back through E18 is identical
    const again = dataOf<MemberView>(await s.getMember(member.id));
    expect(again).toEqual(member);
  });
});

describe("E17 envelope and bad JSON (BR-REC-154)", () => {
  test("BR-REC-154 success is { success: true, data } with status 201", async () => {
    const reply = await s.createMember({ fullName: uniqueName("Envelope") });
    expect(reply.status).toBe(201);
    expect(reply.body?.success).toBe(true);
    expect(reply.body?.data).toBeDefined();
    expect(reply.body).not.toHaveProperty("code");
  });

  test("BR-REC-154 a refused request is { success: false, message, code }", async () => {
    const reply = await s.createMember({ sex: "other" });
    expectError(reply, 400, "VALIDATION_ERROR");
    expect(reply.body?.details?.issues).toBeDefined();
  });

  test("BR-REC-154 a body that is not JSON is 400 INVALID_JSON", async () => {
    const reply = await s.send("POST", "/api/members", {
      rawBody: "{not json",
      key: crypto.randomUUID(),
    });
    expectError(reply, 400, "INVALID_JSON");
  });
});
