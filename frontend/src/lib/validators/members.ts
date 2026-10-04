import { z } from 'zod';
import { type IsoDate, isIsoDate } from '@/lib/domain/dates';
import { messageForCode } from '@/lib/messages/errors';

// Mirrors backend/src/types/members.types.ts (the server checks again, BR-REC-45, 46, 48, 49, 50).
// Every message is one plain sentence that says what to do, shown next to its field (BR-REC-128, 134).
// "Today" is an argument (the device's day in the gym's zone), never read from a clock here.

export const PLANS = ['monthly', 'quarterly', 'half_annual', 'annual'] as const;
export const SEXES = ['male', 'female'] as const;
export const OBJECTIVES = ['fat_loss', 'strength', 'general_fitness', 'other'] as const;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;
export const NOTES_MAX_LENGTH = 1000;
const PHONE_MESSAGE = 'Enter 10 to 15 digits, like 98450 12345';
export const START_BEFORE_JOIN_LINE = "Membership can't start before the join date";

/** BR-REC-45: outer spaces trimmed, every run of white space becomes one space. */
export const normalizeName = (raw: string): string => raw.trim().replace(/\s+/g, ' ');

const PHONE_NOISE = /[\s\-()[\]]/g;
const PHONE_SHAPE = /^\+?\d{10,15}$/;

/** BR-REC-46: spaces, dashes and brackets removed, then an optional leading + and 10-15 digits; else null. */
export const cleanPhone = (raw: string): string | null => {
  const cleaned = raw.replace(PHONE_NOISE, '');
  return PHONE_SHAPE.test(cleaned) ? cleaned : null;
};

const lastTen = (phone: string): string | null => {
  const digits = phone.replace(/\D/g, '');
  return digits.length < 10 ? null : digits.slice(-10);
};

/** BR-REC-46: two phones are the same when their last 10 digits match (false when either has fewer). */
export const samePhone = (a: string, b: string): boolean => {
  const first = lastTen(a);
  return first !== null && first === lastTen(b);
};

// Pushes one issue on the field being checked and stops the transform.
type Ctx = z.core.$RefinementCtx<unknown>;
const refuse = (ctx: Ctx, message: string): typeof z.NEVER => {
  ctx.issues.push({ code: 'custom', message, input: ctx.value });
  return z.NEVER;
};

const fullName = z.string({ error: 'Enter the full name' }).transform((raw, ctx) => {
  const name = normalizeName(raw);
  if (name === '') return refuse(ctx, 'Enter the full name');
  if (name.length < NAME_MIN_LENGTH) return refuse(ctx, `Use at least ${NAME_MIN_LENGTH} letters`);
  if (name.length > NAME_MAX_LENGTH)
    return refuse(ctx, `Use at most ${NAME_MAX_LENGTH} characters`);
  return name;
});

const phone = z.string({ error: 'Enter a phone number' }).transform((raw, ctx) => {
  if (raw.trim() === '') return refuse(ctx, 'Enter a phone number');
  return cleanPhone(raw) ?? refuse(ctx, PHONE_MESSAGE);
});

// Chips start empty (no default plan, BR-REC-50): the form holds '' until one is chosen, so these take
// any text and refuse everything that is not one of the choices.
const sex = z.string({ error: 'Pick Male or Female' }).transform((raw, ctx) => {
  return SEXES.find((option) => option === raw) ?? refuse(ctx, 'Pick Male or Female');
});

const plan = z.string({ error: 'Pick a membership plan' }).transform((raw, ctx) => {
  return PLANS.find((option) => option === raw) ?? refuse(ctx, 'Pick a membership plan');
});

const email = z
  .string()
  .nullish()
  .transform((raw, ctx) => {
    const value = raw?.trim() ?? '';
    if (value === '') return null;
    return z.email().safeParse(value).success
      ? value
      : refuse(ctx, 'Enter an email like name@example.com');
  });

const objective = z
  .string()
  .nullish()
  .transform((raw, ctx) => {
    if (raw === undefined || raw === null || raw === '') return null;
    const found = OBJECTIVES.find((option) => option === raw);
    return found ?? refuse(ctx, 'Pick one of the goals');
  });

const notes = z
  .string()
  .nullish()
  .transform((raw, ctx) => {
    const value = raw?.trim() ?? '';
    if (value === '') return null;
    return value.length > NOTES_MAX_LENGTH
      ? refuse(ctx, `Use at most ${NOTES_MAX_LENGTH.toLocaleString('en')} characters`)
      : value;
  });

/** A real calendar day (`YYYY-MM-DD`); `today` as the latest allowed day when given (BR-REC-48). */
const day = (missing: string, latest?: IsoDate) =>
  z.string({ error: missing }).transform((raw, ctx) => {
    if (raw === '') return refuse(ctx, missing);
    if (!isIsoDate(raw)) return refuse(ctx, 'Enter a real date');
    if (latest !== undefined && raw > latest) return refuse(ctx, messageForCode('DATE_IN_FUTURE'));
    return raw;
  });

const memberFields = (today: IsoDate) => ({
  fullName,
  phone,
  dateOfBirth: day('Enter the date of birth', today),
  sex,
  joinedOn: day('Enter the join date', today),
  email,
  objective,
  notes,
});

/** S8 Edit member (BR-REC-03, 45, 46, 48, 49): the member fields, cleaned; no membership fields. */
export const memberEditFormSchema = (today: IsoDate) => z.object(memberFields(today));

/**
 * S6 Add member (BR-REC-03, 05, 45-50). The parsed output is the E17 body (`firstPeriod`). There is no
 * default plan (BR-REC-50); the first membership may start in the past (historical entry) but not before
 * the join date, and the problem sits on "Starts on".
 */
export const memberFormSchema = (today: IsoDate) =>
  z
    .object({ ...memberFields(today), plan, startOn: day('Pick a start date') })
    // `when` keeps this check running while other fields still have problems, so "Starts on" shows its
    // sentence as soon as the field is left, not only once the rest of the form is fine.
    .refine(
      ({ joinedOn, startOn }) => !isIsoDate(joinedOn) || !isIsoDate(startOn) || startOn >= joinedOn,
      { error: START_BEFORE_JOIN_LINE, path: ['startOn'], when: () => true },
    )
    .transform(({ plan: chosenPlan, startOn, ...member }) => ({
      ...member,
      firstPeriod: { plan: chosenPlan, startOn },
    }));

/** S9 Renew / edit a period (BR-REC-54): both required; a start in the future is fine (renewing early). */
export const periodFormSchema = z.object({ plan, startOn: day('Pick a start date') });

export type MemberFormInput = z.input<ReturnType<typeof memberFormSchema>>;
export type MemberFormValues = z.output<ReturnType<typeof memberFormSchema>>;
export type MemberEditFormInput = z.input<ReturnType<typeof memberEditFormSchema>>;
export type MemberEditFormValues = z.output<ReturnType<typeof memberEditFormSchema>>;
export type PeriodFormInput = z.input<typeof periodFormSchema>;
export type PeriodFormValues = z.output<typeof periodFormSchema>;
