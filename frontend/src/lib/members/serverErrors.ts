import { isApiError } from '@/lib/api/errors';
import { messageForCode } from '@/lib/messages/errors';
import { MEMBER_FORM_ORDER } from './formFields';

export type MemberFormField = (typeof MEMBER_FORM_ORDER)[number];
export type EditFormField = Exclude<MemberFormField, 'plan' | 'startOn'>;

const isEditField = (field: MemberFormField): field is EditFormField =>
  field !== 'plan' && field !== 'startOn';

// E19 refuses a join date that falls after one of the member's membership starts. The dictionary's
// START_BEFORE_JOIN sentence tells the trainer to pick a later *start* date, which is the wrong advice
// on the Edit form, so this screen says it its own way (QUESTIONS: a second dictionary entry).
export const JOIN_AFTER_MEMBERSHIP_START_LINE =
  'A membership starts before this date. Pick an earlier join date.';

const DATE_FIELDS = ['dateOfBirth', 'joinedOn'] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

// `firstPeriod.startOn` and `firstPeriod.plan` are the form's `startOn` and `plan`.
const toFormField = (path: unknown): MemberFormField | null => {
  const text = Array.isArray(path) ? path.map(String).join('.') : String(path ?? '');
  const field = text.startsWith('firstPeriod.') ? text.slice('firstPeriod.'.length) : text;
  return MEMBER_FORM_ORDER.find((name) => name === field) ?? null;
};

/**
 * Which form field a server refusal belongs to, and the sentence to put next to it (BR-REC-128, 134):
 * `DATE_IN_FUTURE` under `details.field`; `START_BEFORE_JOIN` under "Starts on" (E17) or "Joined on"
 * (E19); a `VALIDATION_ERROR` under the first field it names. Anything else is not a field's: null
 * (the mutation shows it as a short message).
 */
export function serverFieldError(
  err: unknown,
  endpoint: 'create',
): { field: MemberFormField; message: string } | null;
export function serverFieldError(
  err: unknown,
  endpoint: 'update',
): { field: EditFormField; message: string } | null;
export function serverFieldError(
  err: unknown,
  endpoint: 'create' | 'update',
): { field: MemberFormField; message: string } | null {
  const found = fieldErrorOf(err, endpoint);
  // Edit member has no plan or start date field, so a refusal naming one is not shown on a field.
  return found && endpoint === 'update' && !isEditField(found.field) ? null : found;
}

function fieldErrorOf(
  err: unknown,
  endpoint: 'create' | 'update',
): { field: MemberFormField; message: string } | null {
  if (!isApiError(err)) return null;
  const details = asRecord(asRecord(err.body)?.details);

  if (err.code === 'DATE_IN_FUTURE') {
    const field = DATE_FIELDS.find((name) => name === details?.field);
    return field ? { field, message: messageForCode(err.code) } : null;
  }
  if (err.code === 'START_BEFORE_JOIN') {
    return endpoint === 'create'
      ? { field: 'startOn', message: messageForCode(err.code) }
      : { field: 'joinedOn', message: JOIN_AFTER_MEMBERSHIP_START_LINE };
  }
  if (err.code === 'VALIDATION_ERROR') {
    const issues = Array.isArray(details?.issues) ? details.issues : [];
    for (const issue of issues) {
      const field = toFormField(asRecord(issue)?.path);
      if (field) return { field, message: messageForCode(err.code) };
    }
  }
  return null;
}
