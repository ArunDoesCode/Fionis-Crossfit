import { describe, expect, test } from "bun:test";

import {
  cleanPhone,
  createMemberBodySchema,
  emailSchema,
  fullNameSchema,
  notesSchema,
  phoneDigits,
  phoneSchema,
  updateMemberBodySchema,
} from "../../src/types/members.types";

// Field rules of members.md: BR-REC-03 (required and optional fields), BR-REC-45
// (name, email, notes), BR-REC-46 (phone), BR-REC-49 (sex), BR-REC-157 (update bodies).
// These test the importable Zod units named in the contract; the same rules are
// tested through the API in create-member.test.ts and update-member.test.ts.

const validBody = () => ({
  fullName: "Surya Pratap",
  phone: "9845012345",
  dateOfBirth: "1982-05-10",
  sex: "male",
  joinedOn: "2025-06-01",
  firstPeriod: { plan: "annual", startOn: "2025-06-01" },
});

describe("BR-REC-46 phone: spaces, dashes and brackets are removed, then + and 10-15 digits", () => {
  // [raw, cleaned form that is stored and returned, digits only (phone_digits)]
  const VALID: [string, string, string][] = [
    ["+91 98450-12345", "+919845012345", "919845012345"],
    ["9845012345", "9845012345", "9845012345"],
    ["98450 12345", "9845012345", "9845012345"],
    ["98450-12345", "9845012345", "9845012345"],
    ["(98450) 12345", "9845012345", "9845012345"],
    ["[98450]-12345", "9845012345", "9845012345"],
    ["  98450 12345  ", "9845012345", "9845012345"],
    ["98450\t12345", "9845012345", "9845012345"],
    ["+9845012345", "+9845012345", "9845012345"],
    ["+91 (98450) 12345", "+919845012345", "919845012345"],
    ["+91-98450-12345", "+919845012345", "919845012345"],
    ["123456789012345", "123456789012345", "123456789012345"],
    ["+919845012345678", "+919845012345678", "919845012345678"],
  ];
  for (const [raw, cleaned, digits] of VALID) {
    test(`BR-REC-46 ${JSON.stringify(raw)} is accepted and becomes ${cleaned}`, () => {
      const parsed = phoneSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toBe(cleaned);
      expect(cleanPhone(raw)).toBe(cleaned);
      expect(phoneDigits(cleaned)).toBe(digits);
    });
  }

  const INVALID: [string, string][] = [
    ["984501234", "9 digits"],
    ["9845012345678901", "16 digits"],
    ["98450+12345", "a + in the middle"],
    ["++919845012345", "two leading +"],
    ["98450abcde", "letters"],
    ["98450.12345", "a dot (not one of the removed characters)"],
    ["", "empty"],
    ["   ", "only spaces"],
    ["+", "only a +"],
    ["+98450", "too short with a +"],
  ];
  for (const [raw, why] of INVALID) {
    test(`BR-REC-46 ${JSON.stringify(raw)} is refused (${why})`, () => {
      expect(phoneSchema.safeParse(raw).success).toBe(false);
    });
  }

  test('BR-REC-46 "+91 98450-12345" and "9845012345" share their last 10 digits, so they are the same phone', () => {
    const a = phoneDigits(cleanPhone("+91 98450-12345"));
    const b = phoneDigits(cleanPhone("9845012345"));
    expect(a.slice(-10)).toBe(b.slice(-10));
    expect(a).not.toBe(b);
  });
});

describe("BR-REC-45 name: outer spaces trimmed, double spaces collapsed, 2-80 characters", () => {
  test('BR-REC-45 " Surya  Pratap " becomes "Surya Pratap"', () => {
    expect(fullNameSchema.parse(" Surya  Pratap ")).toBe("Surya Pratap");
  });

  test("BR-REC-45 a run of many spaces becomes one", () => {
    expect(fullNameSchema.parse("Surya      Pratap   Singh")).toBe(
      "Surya Pratap Singh",
    );
  });

  test("BR-REC-45 two characters is the shortest name", () => {
    expect(fullNameSchema.safeParse("Su").success).toBe(true);
    expect(fullNameSchema.safeParse("S").success).toBe(false);
  });

  test("BR-REC-45 one character with outer spaces is still too short", () => {
    expect(fullNameSchema.safeParse("  S  ").success).toBe(false);
    expect(fullNameSchema.safeParse("   ").success).toBe(false);
    expect(fullNameSchema.safeParse("").success).toBe(false);
  });

  test("BR-REC-45 80 characters is the longest name, 81 is refused", () => {
    expect(fullNameSchema.safeParse("a".repeat(80)).success).toBe(true);
    expect(fullNameSchema.safeParse("a".repeat(81)).success).toBe(false);
  });

  test("BR-REC-45 the length is counted after trimming and collapsing", () => {
    const raw = `${"a".repeat(40)}${" ".repeat(10)}${"b".repeat(35)}`; // 85 raw, 76 clean
    const parsed = fullNameSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBe(`${"a".repeat(40)} ${"b".repeat(35)}`);
    // 81 once collapsed: refused
    expect(
      fullNameSchema.safeParse(`${"a".repeat(40)}  ${"b".repeat(40)}`).success,
    ).toBe(false);
  });

  test("BR-REC-45 a name that is not a string is refused", () => {
    expect(fullNameSchema.safeParse(null).success).toBe(false);
    expect(fullNameSchema.safeParse(42).success).toBe(false);
  });
});

describe("BR-REC-45 email: must look like an email; empty means none", () => {
  test("BR-REC-45 a normal email is accepted", () => {
    expect(emailSchema.parse("surya@example.com")).toBe("surya@example.com");
  });

  test("BR-REC-45 outer spaces are trimmed", () => {
    expect(emailSchema.parse("  surya@example.com ")).toBe("surya@example.com");
  });

  test("BR-REC-45 empty, spaces only and null all mean no email", () => {
    expect(emailSchema.parse("")).toBeNull();
    expect(emailSchema.parse("   ")).toBeNull();
    expect(emailSchema.parse(null)).toBeNull();
  });

  for (const bad of [
    "surya",
    "surya@",
    "@example.com",
    "surya example@x.com",
    "surya@@example.com",
  ]) {
    test(`BR-REC-45 ${JSON.stringify(bad)} does not look like an email`, () => {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    });
  }
});

describe("BR-REC-45 notes: up to 1,000 characters", () => {
  test("BR-REC-45 1,000 characters is accepted, 1,001 is refused", () => {
    expect(notesSchema.safeParse("n".repeat(1000)).success).toBe(true);
    expect(notesSchema.safeParse("n".repeat(1001)).success).toBe(false);
  });

  test("BR-REC-45 the limit is counted after trimming", () => {
    const padded = `  ${"n".repeat(1000)}  `;
    const parsed = notesSchema.safeParse(padded);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toBe("n".repeat(1000));
  });

  test("BR-REC-45 notes are trimmed; empty, spaces only and null mean no notes", () => {
    expect(notesSchema.parse("  prefers mornings ")).toBe("prefers mornings");
    expect(notesSchema.parse("")).toBeNull();
    expect(notesSchema.parse("  \n ")).toBeNull();
    expect(notesSchema.parse(null)).toBeNull();
  });
});

describe("BR-REC-03, 49 create body (E17)", () => {
  test("BR-REC-03 a body with every required field is accepted", () => {
    expect(createMemberBodySchema.safeParse(validBody()).success).toBe(true);
  });

  for (const field of [
    "fullName",
    "phone",
    "dateOfBirth",
    "sex",
    "joinedOn",
    "firstPeriod",
  ]) {
    test(`BR-REC-03 / 05 a body without ${field} is refused`, () => {
      const body: Record<string, unknown> = validBody();
      delete body[field];
      expect(createMemberBodySchema.safeParse(body).success).toBe(false);
    });
  }

  test("BR-REC-05 a first period needs both plan and start date", () => {
    for (const firstPeriod of [
      { plan: "annual" },
      { startOn: "2025-06-01" },
      {},
    ]) {
      expect(
        createMemberBodySchema.safeParse({ ...validBody(), firstPeriod })
          .success,
      ).toBe(false);
    }
  });

  test("BR-REC-03 email, objective and notes are optional", () => {
    const parsed = createMemberBodySchema.safeParse(validBody());
    expect(parsed.success).toBe(true);
    const full = createMemberBodySchema.safeParse({
      ...validBody(),
      email: "surya@example.com",
      objective: "strength",
      notes: "Left shoulder",
    });
    expect(full.success).toBe(true);
  });

  for (const objective of [
    "fat_loss",
    "strength",
    "general_fitness",
    "other",
    null,
  ]) {
    test(`BR-REC-03 objective ${objective} is accepted`, () => {
      expect(
        createMemberBodySchema.safeParse({ ...validBody(), objective }).success,
      ).toBe(true);
    });
  }

  test("BR-REC-03 an objective outside the four values is refused", () => {
    expect(
      createMemberBodySchema.safeParse({ ...validBody(), objective: "cardio" })
        .success,
    ).toBe(false);
  });

  for (const sex of ["male", "female"]) {
    test(`BR-REC-49 sex ${sex} is accepted`, () => {
      expect(
        createMemberBodySchema.safeParse({ ...validBody(), sex }).success,
      ).toBe(true);
    });
  }

  for (const sex of ["other", "", "m", "unknown", null, 1]) {
    test(`BR-REC-49 sex ${JSON.stringify(sex)} is refused`, () => {
      expect(
        createMemberBodySchema.safeParse({ ...validBody(), sex }).success,
      ).toBe(false);
    });
  }

  test("BR-REC-03 / 45 / 46 the parsed body carries the cleaned values", () => {
    const parsed = createMemberBodySchema.parse({
      ...validBody(),
      fullName: " Surya  Pratap ",
      phone: "+91 98450-12345",
      email: "  ",
      notes: "",
    });
    expect(parsed.fullName).toBe("Surya Pratap");
    expect(parsed.phone).toBe("+919845012345");
    expect(parsed.email).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  for (const dateOfBirth of ["1982-02-30", "1982-13-01", "10-05-1982", "x"]) {
    test(`BR-REC-153 date of birth ${JSON.stringify(dateOfBirth)} is not a real YYYY-MM-DD day`, () => {
      expect(
        createMemberBodySchema.safeParse({ ...validBody(), dateOfBirth })
          .success,
      ).toBe(false);
    });
  }
});

describe("BR-REC-157 update body (E19): any member field, at least one, nothing else", () => {
  test("BR-REC-157 an empty body is refused", () => {
    expect(updateMemberBodySchema.safeParse({}).success).toBe(false);
  });

  test("BR-REC-157 one field is enough", () => {
    expect(updateMemberBodySchema.safeParse({ fullName: "Su" }).success).toBe(
      true,
    );
  });

  test("BR-REC-157 an unknown field is refused, also next to a valid one", () => {
    expect(updateMemberBodySchema.safeParse({ nickname: "S" }).success).toBe(
      false,
    );
    expect(
      updateMemberBodySchema.safeParse({ fullName: "Su", nickname: "S" })
        .success,
    ).toBe(false);
  });

  test("BR-REC-157 the archive state and the periods cannot be set here", () => {
    expect(
      updateMemberBodySchema.safeParse({ archivedAt: "2026-01-01T00:00:00Z" })
        .success,
    ).toBe(false);
    expect(
      updateMemberBodySchema.safeParse({
        periods: [{ plan: "monthly", startOn: "2026-01-01" }],
      }).success,
    ).toBe(false);
    expect(updateMemberBodySchema.safeParse({ id: "x" }).success).toBe(false);
  });

  test("BR-REC-157 null clears email, objective and notes", () => {
    for (const body of [
      { email: null },
      { objective: null },
      { notes: null },
    ]) {
      expect(updateMemberBodySchema.safeParse(body).success).toBe(true);
    }
  });

  test("BR-REC-157 null is not allowed for the required fields", () => {
    for (const body of [
      { fullName: null },
      { phone: null },
      { dateOfBirth: null },
      { sex: null },
      { joinedOn: null },
    ]) {
      expect(updateMemberBodySchema.safeParse(body).success).toBe(false);
    }
  });

  test("BR-REC-45 / 46 / 49 the same field rules apply to an update", () => {
    const parsed = updateMemberBodySchema.parse({
      fullName: " Surya  Pratap ",
      phone: "(98450) 12345",
    });
    expect(parsed.fullName).toBe("Surya Pratap");
    expect(parsed.phone).toBe("9845012345");
    expect(updateMemberBodySchema.safeParse({ sex: "other" }).success).toBe(
      false,
    );
    expect(updateMemberBodySchema.safeParse({ phone: "12345" }).success).toBe(
      false,
    );
    expect(updateMemberBodySchema.safeParse({ fullName: "S" }).success).toBe(
      false,
    );
    expect(updateMemberBodySchema.safeParse({ email: "nope" }).success).toBe(
      false,
    );
  });
});
