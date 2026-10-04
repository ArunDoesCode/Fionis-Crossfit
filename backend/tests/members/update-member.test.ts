import { describe, expect, test } from "bun:test";

import { OTHER_UNKNOWN_ID, UNKNOWN_ID } from "../helpers/http";
import {
  ageOnDay,
  birthdayOffset,
  dataOf,
  expectError,
  expectMemberShape,
  MARK,
  type MemberView,
  nextPhone,
  useMembersSuite,
} from "./support/suite";

// E19 PATCH /api/members/:memberId: edit a member (archived members too).
// BR-REC-03, 04, 45, 46, 48, 49, 50 and 55 (join date vs period starts, spec clarification
// 2026-10-04), 58 (archived members stay editable and stay archived), 154, 157, 158.

const s = useMembersSuite();

describe("E19 update bodies (BR-REC-157)", () => {
  test("BR-REC-157 an empty body is 400 VALIDATION_ERROR", async () => {
    const m = await s.seedMember({ name: "Empty Patch" });
    expectError(await s.patchMember(m.id, {}), 400, "VALIDATION_ERROR");
  });

  test("BR-REC-157 an unknown field is 400, and a valid field sent next to it is not applied", async () => {
    const m = await s.seedMember({ name: "Unknown Key" });
    const reply = await s.patchMember(m.id, {
      fullName: `Changed ${MARK}`,
      nickname: "S",
    });
    expectError(reply, 400, "VALIDATION_ERROR");
    expect((await s.memberRow(m.id))?.fullName).toBe(m.fullName);
  });

  test("BR-REC-157 archivedAt, periods and id cannot be set through E19", async () => {
    const m = await s.seedMember({ name: "No Archive Field" });
    for (const body of [
      { archivedAt: "2026-01-01T00:00:00.000Z" },
      { archivedAt: null },
      { periods: [] },
      { id: OTHER_UNKNOWN_ID },
    ]) {
      expectError(await s.patchMember(m.id, body), 400, "VALIDATION_ERROR");
    }
    expect((await s.memberRow(m.id))?.archivedAt).toBeNull();
  });

  test("BR-REC-157 a body that is not JSON is 400 INVALID_JSON", async () => {
    const m = await s.seedMember({ name: "Bad Json" });
    const reply = await s.send("PATCH", `/api/members/${m.id}`, {
      rawBody: "{nope",
    });
    expectError(reply, 400, "INVALID_JSON");
  });

  test("BR-REC-154 an id that exists nowhere is 404 NOT_FOUND", async () => {
    expectError(
      await s.patchMember(UNKNOWN_ID, { notes: "x" }),
      404,
      "NOT_FOUND",
    );
  });

  test("BR-REC-154 a malformed id is 400 VALIDATION_ERROR", async () => {
    expectError(
      await s.patchMember("not-an-id", { notes: "x" }),
      400,
      "VALIDATION_ERROR",
    );
  });
});

describe("E19 changing fields", () => {
  test("a changed name comes back in the member and is stored; other fields stay as they were", async () => {
    const m = await s.seedMember({
      name: "Before Name",
      email: "keep@example.com",
      notes: "keep this",
      objective: "strength",
    });
    const newName = `After Name ${MARK}`;
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { fullName: newName }),
    );
    expect(member.fullName).toBe(newName);
    expect(member.email).toBe("keep@example.com");
    expect(member.notes).toBe("keep this");
    expect(member.objective).toBe("strength");
    expect((await s.memberRow(m.id))?.fullName).toBe(newName);
  });

  test("BR-REC-03 / 59 the answer is the member as E18 shows it (all fields, membership and periods)", async () => {
    const m = await s.seedMember({ name: "Shape Patch" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { notes: "shape" }),
    );
    expectMemberShape(member);
    expect(dataOf<MemberView>(await s.getMember(m.id))).toEqual(member);
  });

  test("several fields can change in one request", async () => {
    const m = await s.seedMember({ name: "Many Fields", sex: "male" });
    const phone = nextPhone();
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, {
        phone,
        sex: "female",
        objective: "fat_loss",
        email: "many@example.com",
        notes: "hello",
      }),
    );
    expect(member).toMatchObject({
      phone,
      sex: "female",
      objective: "fat_loss",
      email: "many@example.com",
      notes: "hello",
    });
  });

  test("BR-REC-157 null clears email, objective and notes; a field that is left out stays", async () => {
    const m = await s.seedMember({
      name: "Clear Fields",
      email: "clear@example.com",
      objective: "other",
      notes: "to be cleared",
    });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { notes: null, objective: null }),
    );
    expect(member.notes).toBeNull();
    expect(member.objective).toBeNull();
    expect(member.email).toBe("clear@example.com");
    const stored = await s.memberRow(m.id);
    expect(stored?.notes).toBeNull();
    expect(stored?.objective).toBeNull();
    expect(stored?.email).toBe("clear@example.com");
  });

  test("BR-REC-157 null on a required field is 400", async () => {
    const m = await s.seedMember({ name: "Null Required" });
    for (const field of [
      "fullName",
      "phone",
      "dateOfBirth",
      "sex",
      "joinedOn",
    ]) {
      expectError(
        await s.patchMember(m.id, { [field]: null }),
        400,
        "VALIDATION_ERROR",
      );
    }
  });

  test("BR-REC-03 the date of birth can change and the age follows", async () => {
    const m = await s.seedMember({ name: "Change Dob" });
    const dob = birthdayOffset(s.today(), 25, 0);
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { dateOfBirth: dob }),
    );
    expect(member.dateOfBirth).toBe(dob);
    expect(member.age).toBe(25);
    expect(member.age).toBe(ageOnDay(dob, s.today()));
  });

  test("BR-REC-03 the join date can move earlier", async () => {
    const m = await s.seedMember({
      name: "Join Earlier",
      joinedOn: s.day(-100),
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { joinedOn: s.day(-200) }),
    );
    expect(member.joinedOn).toBe(s.day(-200));
  });

  test("BR-REC-04 a phone that another member has is accepted", async () => {
    const other = await s.seedMember({ name: "Phone Owner" });
    const m = await s.seedMember({ name: "Phone Taker" });
    const otherRow = await s.memberRow(other.id);
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { phone: otherRow?.phone }),
    );
    expect(member.phone).toBe(otherRow?.phone as string);
  });
});

describe("E19 cleaning and field rules (BR-REC-45, 46, 49)", () => {
  test("BR-REC-45 a name is trimmed and double spaces collapse", async () => {
    const m = await s.seedMember({ name: "Clean Name" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { fullName: `  Surya   Pratap  ${MARK}  ` }),
    );
    expect(member.fullName).toBe(`Surya Pratap ${MARK}`);
  });

  test('BR-REC-46 a phone "+91 98450-12345" is stored as +919845012345 and phone_digits follows (919845012345)', async () => {
    const m = await s.seedMember({ name: "Clean Phone" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { phone: "+91 98450-12345" }),
    );
    expect(member.phone).toBe("+919845012345");
    const stored = await s.memberRow(m.id);
    expect(stored?.phone).toBe("+919845012345");
    expect(stored?.phoneDigits).toBe("919845012345");
  });

  test("BR-REC-45 an email is trimmed; an empty one means none; notes are trimmed and empty means none", async () => {
    const m = await s.seedMember({
      name: "Clean Mail",
      email: "old@example.com",
      notes: "old notes",
    });
    const trimmed = dataOf<MemberView>(
      await s.patchMember(m.id, { email: "  new@example.com " }),
    );
    expect(trimmed.email).toBe("new@example.com");
    const cleared = dataOf<MemberView>(
      await s.patchMember(m.id, { email: "", notes: "   " }),
    );
    expect(cleared.email).toBeNull();
    expect(cleared.notes).toBeNull();
  });

  const BAD: [string, Record<string, unknown>][] = [
    ["BR-REC-49 sex other", { sex: "other" }],
    ["BR-REC-45 name of one character", { fullName: "S" }],
    ["BR-REC-45 name of 81 characters", { fullName: "a".repeat(81) }],
    ["BR-REC-46 phone of 9 digits", { phone: "984501234" }],
    ["BR-REC-46 phone with letters", { phone: "98450abcde" }],
    ["BR-REC-45 email that is not an email", { email: "nope" }],
    ["BR-REC-45 notes of 1,001 characters", { notes: "n".repeat(1001) }],
    ["BR-REC-03 objective outside the four", { objective: "cardio" }],
    [
      "BR-REC-153 date of birth that is not a day",
      { dateOfBirth: "1982-02-30" },
    ],
    ["BR-REC-153 join date in the wrong format", { joinedOn: "1-6-2025" }],
  ];
  for (const [label, body] of BAD) {
    test(`${label} is 400 VALIDATION_ERROR and nothing changes`, async () => {
      const m = await s.seedMember({ name: "Bad Patch" });
      expectError(await s.patchMember(m.id, body), 400, "VALIDATION_ERROR");
      expect((await s.memberRow(m.id))?.fullName).toBe(m.fullName);
    });
  }

  test("BR-REC-45 / 49 the accepted edges: name of 2 characters, notes of 1,000, sex female", async () => {
    const m = await s.seedMember({ name: "Edges" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, {
        fullName: "Su",
        notes: "n".repeat(1000),
        sex: "female",
      }),
    );
    expect(member.fullName).toBe("Su");
    expect(member.notes).toBe("n".repeat(1000));
    expect(member.sex).toBe("female");
  });
});

describe("E19 dates (BR-REC-48, 50, 55)", () => {
  test("BR-REC-48 a date of birth in the future is 400 DATE_IN_FUTURE with details.field dateOfBirth, and nothing changes", async () => {
    const m = await s.seedMember({
      name: "Future Dob",
      dateOfBirth: "1990-01-01",
    });
    const reply = await s.patchMember(m.id, { dateOfBirth: s.day(1) });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "dateOfBirth" });
    expect((await s.memberRow(m.id))?.dateOfBirth).toBe("1990-01-01");
  });

  test("BR-REC-48 a join date in the future is 400 DATE_IN_FUTURE with details.field joinedOn", async () => {
    const m = await s.seedMember({ name: "Future Join" });
    const reply = await s.patchMember(m.id, { joinedOn: s.day(1) });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "joinedOn" });
  });

  test("BR-REC-48 with both in the future the date of birth is reported", async () => {
    const m = await s.seedMember({ name: "Both Future Patch" });
    const reply = await s.patchMember(m.id, {
      dateOfBirth: s.day(4),
      joinedOn: s.day(2),
    });
    expectError(reply, 400, "DATE_IN_FUTURE");
    expect(reply.body?.details).toMatchObject({ field: "dateOfBirth" });
  });

  test("BR-REC-48 the future check applies to the fields that are sent: other edits are fine", async () => {
    const m = await s.seedMember({ name: "Only Sent Fields" });
    dataOf<MemberView>(await s.patchMember(m.id, { notes: "fine" }));
  });

  test("BR-REC-48 today is allowed for the date of birth", async () => {
    const m = await s.seedMember({ name: "Born Today Patch" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { dateOfBirth: s.today() }),
    );
    expect(member.age).toBe(0);
  });

  test("BR-REC-48 a date of birth in 1920 is saved (only the form warns)", async () => {
    const m = await s.seedMember({ name: "Old Dob" });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { dateOfBirth: "1920-01-01" }),
    );
    expect(member.dateOfBirth).toBe("1920-01-01");
  });

  test("BR-REC-50 / 55 a join date after the start of a membership is 400 START_BEFORE_JOIN and nothing changes", async () => {
    const start = s.day(-100);
    const m = await s.seedMember({
      name: "Join After Start",
      joinedOn: start,
      periods: [{ plan: "annual", startOn: start }],
    });
    const reply = await s.patchMember(m.id, {
      fullName: `Should Not Apply ${MARK}`,
      joinedOn: s.day(-99),
    });
    expectError(reply, 400, "START_BEFORE_JOIN");
    const stored = await s.memberRow(m.id);
    expect(stored?.joinedOn).toBe(start);
    expect(stored?.fullName).toBe(m.fullName);
  });

  test("BR-REC-50 / 55 a join date equal to the start of the membership is accepted", async () => {
    const start = s.day(-100);
    const m = await s.seedMember({
      name: "Join Equals Start",
      joinedOn: s.day(-150),
      periods: [{ plan: "annual", startOn: start }],
    });
    const member = dataOf<MemberView>(
      await s.patchMember(m.id, { joinedOn: start }),
    );
    expect(member.joinedOn).toBe(start);
  });

  test("BR-REC-50 / 55 the check is against any period: a join date after the oldest start is refused even if the newest starts later", async () => {
    const m = await s.seedMember({
      name: "Join Any Period",
      joinedOn: s.day(-600),
      periods: [
        { plan: "annual", startOn: s.day(-500), endOn: s.day(-136) },
        { plan: "annual", startOn: s.day(-135), endOn: s.day(229) },
      ],
    });
    expectError(
      await s.patchMember(m.id, { joinedOn: s.day(-300) }),
      400,
      "START_BEFORE_JOIN",
    );
    // before every start: fine
    dataOf<MemberView>(await s.patchMember(m.id, { joinedOn: s.day(-550) }));
  });

  test("BR-REC-50 a join date that is not sent is not checked: other edits of a member whose first period starts before the join date still save", async () => {
    const m = await s.seedMember({
      name: "Odd Binder Data",
      joinedOn: s.day(-50),
      periods: [{ plan: "annual", startOn: s.day(-100) }],
    });
    dataOf<MemberView>(await s.patchMember(m.id, { notes: "still saves" }));
  });
});

describe("E19 archived members stay archived and stay editable (BR-REC-58)", () => {
  test("BR-REC-58 editing an archived member works and never changes archivedAt", async () => {
    const archivedAt = new Date(Date.now() - 5 * 86_400_000);
    const m = await s.seedMember({
      name: "Archived Edit",
      archived: archivedAt,
    });
    const phone = nextPhone();
    const member = dataOf<MemberView>(await s.patchMember(m.id, { phone }));
    expect(member.phone).toBe(phone);
    expect(member.archivedAt).not.toBeNull();
    expect(new Date(member.archivedAt as string).getTime()).toBe(
      archivedAt.getTime(),
    );
    expect((await s.memberRow(m.id))?.archivedAt?.getTime()).toBe(
      archivedAt.getTime(),
    );
  });

  test("BR-REC-58 fixing every kind of detail on an archived member still leaves them archived", async () => {
    const m = await s.seedMember({ name: "Archived Many", archived: true });
    dataOf<MemberView>(
      await s.patchMember(m.id, {
        fullName: `Archived Renamed ${MARK}`,
        email: "arch@example.com",
        notes: "old binder",
        objective: "other",
        sex: "female",
      }),
    );
    expect((await s.memberRow(m.id))?.archivedAt).not.toBeNull();
  });
});

describe("E19 change log (BR-REC-158)", () => {
  test("BR-REC-158 rename: one member.update row with before and after of the name only, and this sign-in", async () => {
    const m = await s.seedMember({ name: "Rename Me" });
    const newName = `Renamed ${MARK}`;
    dataOf<MemberView>(await s.patchMember(m.id, { fullName: newName }));
    const rows = await s.audit({ action: "member.update", entityId: m.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sessionId: s.sessionId,
      entity: "member",
      entityId: m.id,
      before: { fullName: m.fullName },
      after: { fullName: newName },
    });
    expect(rows[0]?.before).toEqual({ fullName: m.fullName });
    expect(rows[0]?.after).toEqual({ fullName: newName });
  });

  test("BR-REC-158 only the fields that changed are in the row: a field sent with its stored value is left out", async () => {
    const m = await s.seedMember({
      name: "Partly Same",
      email: "same@example.com",
    });
    dataOf<MemberView>(
      await s.patchMember(m.id, {
        email: "same@example.com",
        notes: "new note",
      }),
    );
    const rows = await s.audit({ action: "member.update", entityId: m.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toEqual({ notes: null });
    expect(rows[0]?.after).toEqual({ notes: "new note" });
  });

  test("BR-REC-158 a phone change is logged under the API field name phone, old and new cleaned form", async () => {
    const m = await s.seedMember({ name: "Phone Log" });
    const oldPhone = (await s.memberRow(m.id))?.phone;
    dataOf<MemberView>(await s.patchMember(m.id, { phone: "+91 98450-12345" }));
    const rows = await s.audit({ action: "member.update", entityId: m.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.before).toEqual({ phone: oldPhone });
    expect(rows[0]?.after).toEqual({ phone: "+919845012345" });
  });

  test("BR-REC-158 sending the stored values again is 200 and writes no change-log row", async () => {
    const m = await s.seedMember({
      name: "No Change",
      email: "nochange@example.com",
    });
    const row = await s.memberRow(m.id);
    const reply = await s.patchMember(m.id, {
      fullName: row?.fullName,
      phone: row?.phone,
      email: "nochange@example.com",
    });
    expect(reply.status).toBe(200);
    expect(await s.audit({ action: "member.update", entityId: m.id })).toEqual(
      [],
    );
  });

  test("BR-REC-158 a value that cleans up to the stored one (extra spaces) is no change either", async () => {
    const m = await s.seedMember({ name: "Spaced Same" });
    const reply = await s.patchMember(m.id, {
      fullName: `  ${m.fullName.replace(" ", "   ")}  `,
    });
    expect(reply.status).toBe(200);
    expect(await s.audit({ action: "member.update", entityId: m.id })).toEqual(
      [],
    );
  });

  test("BR-REC-158 a refused edit (START_BEFORE_JOIN) leaves no change-log row", async () => {
    const start = s.day(-60);
    const m = await s.seedMember({
      name: "Refused Edit",
      joinedOn: start,
      periods: [{ plan: "annual", startOn: start }],
    });
    expectError(
      await s.patchMember(m.id, { joinedOn: s.day(-10) }),
      400,
      "START_BEFORE_JOIN",
    );
    expect(await s.audit({ action: "member.update", entityId: m.id })).toEqual(
      [],
    );
  });

  test("BR-REC-158 an edit of an archived member is logged as member.update and no archive or restore row appears", async () => {
    const m = await s.seedMember({ name: "Archived Log", archived: true });
    dataOf<MemberView>(await s.patchMember(m.id, { notes: "logged" }));
    const rows = await s.auditAbout(m.id);
    expect(rows.map((r) => r.action)).toEqual(["member.update"]);
  });
});
