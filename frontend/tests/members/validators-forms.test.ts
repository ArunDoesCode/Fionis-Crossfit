// Spec: docs/specs/member-records/members.md
//   BR-REC-03 — a member needs full name, phone, date of birth, sex and join date; email, objective and
//               notes are optional.
//   BR-REC-05 — creating a member also needs a first membership (plan + start date).
//   BR-REC-45 — name 2-80 characters after trimming and collapsing spaces; email must look like an
//               email; notes up to 1,000 characters.
//   BR-REC-48 — dates of birth and join dates cannot be in the future; an age under 10 or over 100 only
//               warns ("Please check the date"), it never blocks saving.
//   BR-REC-49 — sex is Male or Female.
//   BR-REC-50 — the first membership has no default plan; it may not start before the join date
//               ("Membership can't start before the join date").
//   ux.md BR-REC-134 — save with no phone -> "Enter a phone number" on the phone field.
// Interface: docs/specs/member-records/members.md — `@/lib/validators/members`:
//   `memberFormSchema(today)` (S6), `memberEditFormSchema(today)` (S8), `periodFormSchema` (S9).
//   Zod schemas: tested only through `safeParse` and the issues it reports (issue `path` = the field).
import { beforeAll, describe, expect, test } from 'bun:test';

interface Issue {
  path: PropertyKey[];
  message: string;
}

type Parsed =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: { issues: Issue[] } };

interface Schema {
  safeParse(input: unknown): Parsed;
}

interface Validators {
  memberFormSchema(today: string): Schema;
  memberEditFormSchema(today: string): Schema;
  periodFormSchema: Schema;
}

let validators: Validators;

beforeAll(async () => {
  validators = (await import('@/lib/validators/members')) as unknown as Validators;
});

const TODAY = '2026-10-03';

const issuesOf = (schema: Schema, input: unknown): Issue[] => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
};

const onField = (issues: Issue[], field: string): Issue[] =>
  issues.filter((issue) => issue.path.length === 1 && issue.path[0] === field);

const dataOf = (schema: Schema, input: unknown): Record<string, unknown> => {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`expected the form to be accepted, got ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
};

// Quotes the spec writes one way may be typed another way; compare on a plain form.
const plain = (text: string): string => text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();

const chars = (n: number, char = 'a'): string => char.repeat(n);

/** A complete, valid S6 form (an annual member who joined on 1 Jun 2025). */
const validCreate = (): Record<string, unknown> => ({
  fullName: 'Surya Pratap',
  phone: '98450 12345',
  dateOfBirth: '1982-05-10',
  sex: 'male',
  joinedOn: '2025-06-01',
  plan: 'annual',
  startOn: '2025-06-01',
});

/** A complete, valid S8 form. */
const validEdit = (): Record<string, unknown> => {
  const { plan: _plan, startOn: _startOn, ...member } = validCreate();
  return member;
};

describe('S6 memberFormSchema accepts a complete form', () => {
  test('BR-REC-05 a form with every required field has no issues', () => {
    expect(issuesOf(validators.memberFormSchema(TODAY), validCreate())).toEqual([]);
  });

  test.each(['monthly', 'quarterly', 'half_annual', 'annual'])(
    'BR-REC-05 the plan "%s" is accepted',
    (plan) => {
      expect(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), plan })).toEqual([]);
    },
  );

  test('BR-REC-05 the parsed output is the create-member body, with the cleaned values', () => {
    const data = dataOf(validators.memberFormSchema(TODAY), {
      fullName: ' Surya  Pratap ',
      phone: '+91 98450-12345',
      dateOfBirth: '1982-05-10',
      sex: 'male',
      joinedOn: '2025-06-01',
      plan: 'annual',
      startOn: '2025-06-01',
      email: 'surya@example.com',
      objective: 'strength',
      notes: 'Bad left knee',
    });
    expect(data).toEqual({
      fullName: 'Surya Pratap',
      phone: '+919845012345',
      dateOfBirth: '1982-05-10',
      sex: 'male',
      joinedOn: '2025-06-01',
      firstPeriod: { plan: 'annual', startOn: '2025-06-01' },
      email: 'surya@example.com',
      objective: 'strength',
      notes: 'Bad left knee',
    });
  });

  test('BR-REC-03 empty optional fields ("") become null', () => {
    const data = dataOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      email: '',
      objective: '',
      notes: '',
    });
    expect(data.email).toBeNull();
    expect(data.objective).toBeNull();
    expect(data.notes).toBeNull();
  });

  test('BR-REC-03 optional fields that are left out are not text (no email, objective or notes)', () => {
    const data = dataOf(validators.memberFormSchema(TODAY), validCreate());
    expect(data.email ?? null).toBeNull();
    expect(data.objective ?? null).toBeNull();
    expect(data.notes ?? null).toBeNull();
  });

  test.each(['fat_loss', 'strength', 'general_fitness', 'other'])(
    'BR-REC-03 the objective "%s" is accepted',
    (objective) => {
      expect(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), objective })).toEqual(
        [],
      );
    },
  );

  test('BR-REC-03 an objective outside the four choices gives an issue on objective', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      objective: 'bulking',
    });
    expect(onField(issues, 'objective').length).toBeGreaterThan(0);
  });
});

describe('S6 memberFormSchema requires the seven fields', () => {
  const required: string[] = [
    'fullName',
    'phone',
    'dateOfBirth',
    'sex',
    'joinedOn',
    'plan',
    'startOn',
  ];

  test.each(required)('BR-REC-03 a form without %s gives an issue on that field', (field) => {
    const input = validCreate();
    delete input[field];
    const issues = issuesOf(validators.memberFormSchema(TODAY), input);
    expect(onField(issues, field).length).toBeGreaterThan(0);
  });

  test.each(required)('BR-REC-03 an empty %s gives an issue on that field', (field) => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), [field]: '' });
    expect(onField(issues, field).length).toBeGreaterThan(0);
  });

  test('BR-REC-03 every issue carries a message to show', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {});
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message.trim().length).toBeGreaterThan(0);
    }
  });

  test('BR-REC-134 a missing phone says "Enter a phone number" on the phone field', () => {
    const input = validCreate();
    delete input.phone;
    const issues = onField(issuesOf(validators.memberFormSchema(TODAY), input), 'phone');
    expect(issues.map((issue) => issue.message)).toContain('Enter a phone number');
  });

  test('BR-REC-134 an empty phone says "Enter a phone number" on the phone field', () => {
    const issues = onField(
      issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), phone: '' }),
      'phone',
    );
    expect(issues.map((issue) => issue.message)).toContain('Enter a phone number');
  });

  test('BR-REC-50 a form with no plan is refused: there is no default plan, the trainer picks one', () => {
    const input = validCreate();
    delete input.plan;
    const issues = issuesOf(validators.memberFormSchema(TODAY), input);
    expect(onField(issues, 'plan').length).toBeGreaterThan(0);
    // and nothing is silently filled in
    expect(validators.memberFormSchema(TODAY).safeParse(input).success).toBe(false);
  });

  test('BR-REC-05 a plan that is not one of the four gives an issue on plan', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      plan: 'weekly',
    });
    expect(onField(issues, 'plan').length).toBeGreaterThan(0);
  });
});

describe('S6 memberFormSchema, name (BR-REC-45)', () => {
  const nameIssues = (fullName: string): Issue[] =>
    onField(
      issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), fullName }),
      'fullName',
    );

  test('BR-REC-45 a 1-character name gives an issue on fullName', () => {
    expect(nameIssues('A').length).toBeGreaterThan(0);
  });

  test('BR-REC-45 a 2-character name is accepted', () => {
    expect(nameIssues('Jo')).toEqual([]);
  });

  test('BR-REC-45 an 80-character name is accepted', () => {
    expect(nameIssues(chars(80))).toEqual([]);
  });

  test('BR-REC-45 an 81-character name gives an issue on fullName', () => {
    expect(nameIssues(chars(81)).length).toBeGreaterThan(0);
  });

  test('BR-REC-45 the length is counted after trimming: " A " is too short', () => {
    expect(nameIssues('   A   ').length).toBeGreaterThan(0);
  });

  test('BR-REC-45 only spaces is not a name', () => {
    expect(nameIssues('      ').length).toBeGreaterThan(0);
  });

  test('BR-REC-45 the length is counted after collapsing spaces: 82 raw characters that make 80', () => {
    // 40 + 3 spaces + 39 = 82 characters typed; "40 + 1 space + 39" = 80 once the spaces are collapsed.
    expect(nameIssues(`${chars(40)}   ${chars(39, 'b')}`)).toEqual([]);
  });

  test('BR-REC-45 the length is counted after trimming: 80 characters inside outer spaces is accepted', () => {
    expect(nameIssues(`  ${chars(80)}  `)).toEqual([]);
  });

  test('BR-REC-45 the parsed name is trimmed and collapsed', () => {
    const data = dataOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      fullName: ' Surya  Pratap ',
    });
    expect(data.fullName).toBe('Surya Pratap');
  });
});

describe('S6 memberFormSchema, phone (BR-REC-46)', () => {
  const phoneIssues = (phone: string): Issue[] =>
    onField(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), phone }), 'phone');

  test.each(['+91 98450-12345', '9845012345', '(98450) 12345', '123456789012345'])(
    'BR-REC-46 the phone "%s" is accepted',
    (phone) => {
      expect(phoneIssues(phone)).toEqual([]);
    },
  );

  test.each(['12345', '984501234', '1234567890123456', 'call me', '98450 1234a'])(
    'BR-REC-46 the phone "%s" gives an issue on phone',
    (phone) => {
      const issues = phoneIssues(phone);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.message.trim().length).toBeGreaterThan(0);
    },
  );

  test('BR-REC-46 the parsed phone is the cleaned one', () => {
    const data = dataOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      phone: '+91 98450-12345',
    });
    expect(data.phone).toBe('+919845012345');
  });
});

describe('S6 memberFormSchema, email and notes (BR-REC-45)', () => {
  const emailIssues = (email: string): Issue[] =>
    onField(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), email }), 'email');
  const notesIssues = (notes: string): Issue[] =>
    onField(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), notes }), 'notes');

  test.each(['surya@example.com', 'surya.p+gym@example.co.in'])(
    'BR-REC-45 the email "%s" is accepted',
    (email) => {
      expect(emailIssues(email)).toEqual([]);
    },
  );

  test.each(['surya', 'surya@', '@example.com', 'sur ya@example.com'])(
    'BR-REC-45 "%s" does not look like an email: issue on email',
    (email) => {
      expect(emailIssues(email).length).toBeGreaterThan(0);
    },
  );

  test('BR-REC-03 an empty email is fine (it is optional)', () => {
    expect(emailIssues('')).toEqual([]);
  });

  test('BR-REC-45 notes of 1,000 characters are accepted', () => {
    expect(notesIssues(chars(1000))).toEqual([]);
  });

  test('BR-REC-45 notes of 1,001 characters give an issue on notes', () => {
    expect(notesIssues(chars(1001)).length).toBeGreaterThan(0);
  });

  test('BR-REC-03 empty notes are fine (they are optional)', () => {
    expect(notesIssues('')).toEqual([]);
  });
});

describe('S6 memberFormSchema, sex (BR-REC-49)', () => {
  const sexIssues = (sex: unknown): Issue[] =>
    onField(issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), sex }), 'sex');

  test.each(['male', 'female'])('BR-REC-49 the sex "%s" is accepted', (sex) => {
    expect(sexIssues(sex)).toEqual([]);
  });

  test.each(['other', 'Male', 'm', 'unknown'])(
    'BR-REC-49 the sex "%s" gives an issue on sex (only Male or Female)',
    (sex) => {
      expect(sexIssues(sex).length).toBeGreaterThan(0);
    },
  );
});

describe('S6 memberFormSchema, dates in the future (BR-REC-48)', () => {
  test('BR-REC-48 a date of birth after today gives an issue on dateOfBirth', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      dateOfBirth: '2030-01-01', // spec example
    });
    expect(onField(issues, 'dateOfBirth').length).toBeGreaterThan(0);
  });

  test('BR-REC-48 a date of birth of tomorrow gives an issue on dateOfBirth', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      dateOfBirth: '2026-10-04',
    });
    expect(onField(issues, 'dateOfBirth').length).toBeGreaterThan(0);
  });

  test('BR-REC-48 a date of birth of today is not in the future', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      dateOfBirth: TODAY,
    });
    expect(onField(issues, 'dateOfBirth')).toEqual([]);
  });

  test('BR-REC-48 a join date after today gives an issue on joinedOn', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      joinedOn: '2026-10-04',
      startOn: '2026-10-04',
    });
    expect(onField(issues, 'joinedOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-48 a join date of today is not in the future', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      joinedOn: TODAY,
      startOn: TODAY,
    });
    expect(onField(issues, 'joinedOn')).toEqual([]);
  });

  test('BR-REC-48 "today" is the argument: the same date of birth is fine once that day is today', () => {
    const input = { ...validCreate(), dateOfBirth: '2026-10-04' };
    expect(
      onField(issuesOf(validators.memberFormSchema('2026-10-03'), input), 'dateOfBirth').length,
    ).toBeGreaterThan(0);
    expect(issuesOf(validators.memberFormSchema('2026-10-04'), input)).toEqual([]);
  });

  test.each(['1920-01-01', '1925-10-03', '2020-01-01', '2026-09-01'])(
    'BR-REC-48 a date of birth that gives an odd age (%s) is a warning only: the form is still accepted',
    (dateOfBirth) => {
      expect(
        issuesOf(validators.memberFormSchema(TODAY), { ...validCreate(), dateOfBirth }),
      ).toEqual([]);
    },
  );

  test.each(['not a date', '2026-02-30', '2026-13-01'])(
    'BR-REC-03 "%s" is not a real calendar day: issue on dateOfBirth',
    (dateOfBirth) => {
      const issues = issuesOf(validators.memberFormSchema(TODAY), {
        ...validCreate(),
        dateOfBirth,
      });
      expect(onField(issues, 'dateOfBirth').length).toBeGreaterThan(0);
    },
  );
});

describe('S6 memberFormSchema, first membership start (BR-REC-50)', () => {
  const CANT_START = "Membership can't start before the join date";

  test('BR-REC-50 joined 1 Jun, start 20 May: issue on startOn "Membership can\'t start before the join date"', () => {
    const issues = onField(
      issuesOf(validators.memberFormSchema(TODAY), {
        ...validCreate(),
        joinedOn: '2026-06-01',
        startOn: '2026-05-20', // spec example
      }),
      'startOn',
    );
    expect(issues.map((issue) => plain(issue.message))).toContain(plain(CANT_START));
  });

  test('BR-REC-50 a start one day before the join date is refused', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      joinedOn: '2026-06-01',
      startOn: '2026-05-31',
    });
    expect(onField(issues, 'startOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-50 the start-before-join problem is on startOn, not on the join date', () => {
    const issues = issuesOf(validators.memberFormSchema(TODAY), {
      ...validCreate(),
      joinedOn: '2026-06-01',
      startOn: '2026-05-20',
    });
    expect(onField(issues, 'joinedOn')).toEqual([]);
  });

  test('BR-REC-50 a start on the join date is accepted', () => {
    expect(
      issuesOf(validators.memberFormSchema(TODAY), {
        ...validCreate(),
        joinedOn: '2026-06-01',
        startOn: '2026-06-01',
      }),
    ).toEqual([]);
  });

  test('BR-REC-05 a start after the join date is accepted (past start dates are allowed for historical entry)', () => {
    expect(
      issuesOf(validators.memberFormSchema(TODAY), {
        ...validCreate(),
        joinedOn: '2025-06-01',
        startOn: '2025-06-15',
      }),
    ).toEqual([]);
  });

  test('BR-REC-05 a past start date is accepted (joined 1 Jun 2025, annual)', () => {
    expect(
      issuesOf(validators.memberFormSchema(TODAY), {
        ...validCreate(),
        joinedOn: '2025-06-01',
        startOn: '2025-06-01',
        plan: 'annual',
      }),
    ).toEqual([]);
  });
});

describe('S8 memberEditFormSchema (the member fields without plan and start)', () => {
  test('BR-REC-03 a complete edit form without plan and start has no issues', () => {
    expect(issuesOf(validators.memberEditFormSchema(TODAY), validEdit())).toEqual([]);
  });

  test('BR-REC-03 no issue is reported on plan or startOn', () => {
    const issues = issuesOf(validators.memberEditFormSchema(TODAY), validEdit());
    expect(onField(issues, 'plan')).toEqual([]);
    expect(onField(issues, 'startOn')).toEqual([]);
  });

  test('BR-REC-03 the parsed output holds the member fields, cleaned, and no first membership', () => {
    const data = dataOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      fullName: ' Surya  Pratap ',
      phone: '+91 98450-12345',
      email: 'surya@example.com',
      objective: 'general_fitness',
      notes: 'Back after a break',
    });
    expect(data).toEqual({
      fullName: 'Surya Pratap',
      phone: '+919845012345',
      dateOfBirth: '1982-05-10',
      sex: 'male',
      joinedOn: '2025-06-01',
      email: 'surya@example.com',
      objective: 'general_fitness',
      notes: 'Back after a break',
    });
    expect('firstPeriod' in data).toBe(false);
  });

  test('BR-REC-03 empty optional fields ("") become null', () => {
    const data = dataOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      email: '',
      objective: '',
      notes: '',
    });
    expect(data.email).toBeNull();
    expect(data.objective).toBeNull();
    expect(data.notes).toBeNull();
  });

  const required: string[] = ['fullName', 'phone', 'dateOfBirth', 'sex', 'joinedOn'];

  test.each(required)('BR-REC-03 an edit form without %s gives an issue on that field', (field) => {
    const input = validEdit();
    delete input[field];
    const issues = issuesOf(validators.memberEditFormSchema(TODAY), input);
    expect(onField(issues, field).length).toBeGreaterThan(0);
  });

  test('BR-REC-134 an empty phone says "Enter a phone number"', () => {
    const issues = onField(
      issuesOf(validators.memberEditFormSchema(TODAY), { ...validEdit(), phone: '' }),
      'phone',
    );
    expect(issues.map((issue) => issue.message)).toContain('Enter a phone number');
  });

  test('BR-REC-45 a 1-character name and an 81-character name give an issue on fullName', () => {
    for (const fullName of ['A', chars(81)]) {
      const issues = issuesOf(validators.memberEditFormSchema(TODAY), { ...validEdit(), fullName });
      expect(onField(issues, 'fullName').length).toBeGreaterThan(0);
    }
  });

  test('BR-REC-46 a phone with 9 digits gives an issue on phone', () => {
    const issues = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      phone: '984501234',
    });
    expect(onField(issues, 'phone').length).toBeGreaterThan(0);
  });

  test('BR-REC-49 the sex "other" gives an issue on sex', () => {
    const issues = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      sex: 'other',
    });
    expect(onField(issues, 'sex').length).toBeGreaterThan(0);
  });

  test('BR-REC-48 a date of birth and a join date after today give an issue on their own field', () => {
    const dob = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      dateOfBirth: '2030-01-01',
    });
    expect(onField(dob, 'dateOfBirth').length).toBeGreaterThan(0);
    const joined = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      joinedOn: '2026-10-04',
    });
    expect(onField(joined, 'joinedOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-48 an odd age is a warning only: the edit form is still accepted', () => {
    expect(
      issuesOf(validators.memberEditFormSchema(TODAY), {
        ...validEdit(),
        dateOfBirth: '1920-01-01',
      }),
    ).toEqual([]);
  });

  test('BR-REC-45 notes of 1,001 characters and a badly shaped email give an issue', () => {
    const notes = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      notes: chars(1001),
    });
    expect(onField(notes, 'notes').length).toBeGreaterThan(0);
    const email = issuesOf(validators.memberEditFormSchema(TODAY), {
      ...validEdit(),
      email: 'surya@',
    });
    expect(onField(email, 'email').length).toBeGreaterThan(0);
  });
});

describe('S9 periodFormSchema ({ plan, startOn }, both required)', () => {
  test('BR-REC-54 a plan and a start date are accepted and parsed as they are', () => {
    expect(dataOf(validators.periodFormSchema, { plan: 'annual', startOn: '2026-06-01' })).toEqual({
      plan: 'annual',
      startOn: '2026-06-01',
    });
  });

  test.each(['monthly', 'quarterly', 'half_annual', 'annual'])(
    'BR-REC-54 the plan "%s" is accepted',
    (plan) => {
      expect(issuesOf(validators.periodFormSchema, { plan, startOn: '2026-06-01' })).toEqual([]);
    },
  );

  test('BR-REC-54 a missing plan gives an issue on plan', () => {
    const issues = issuesOf(validators.periodFormSchema, { startOn: '2026-06-01' });
    expect(onField(issues, 'plan').length).toBeGreaterThan(0);
  });

  test('BR-REC-54 a missing start date gives an issue on startOn', () => {
    const issues = issuesOf(validators.periodFormSchema, { plan: 'annual' });
    expect(onField(issues, 'startOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-54 an empty start date gives an issue on startOn', () => {
    const issues = issuesOf(validators.periodFormSchema, { plan: 'annual', startOn: '' });
    expect(onField(issues, 'startOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-54 a plan that is not one of the four gives an issue on plan', () => {
    const issues = issuesOf(validators.periodFormSchema, { plan: 'weekly', startOn: '2026-06-01' });
    expect(onField(issues, 'plan').length).toBeGreaterThan(0);
  });

  test('BR-REC-54 a start date that is not a real day gives an issue on startOn', () => {
    const issues = issuesOf(validators.periodFormSchema, { plan: 'annual', startOn: '2026-02-30' });
    expect(onField(issues, 'startOn').length).toBeGreaterThan(0);
  });

  test('BR-REC-54 a start date in the future is accepted (renewing early)', () => {
    expect(
      issuesOf(validators.periodFormSchema, { plan: 'monthly', startOn: '2030-01-01' }),
    ).toEqual([]);
  });
});
