/** The fields of S6/S8 in screen order: "Save" scrolls to the first one with a problem (BR-REC-134). */
export const MEMBER_FORM_ORDER = [
  'fullName',
  'phone',
  'dateOfBirth',
  'sex',
  'joinedOn',
  'plan',
  'startOn',
  'email',
  'objective',
  'notes',
] as const;

/** The id of a field's element (the input, or the box around a set of chips) inside the form `formId`. */
export const fieldId = (formId: string, field: string): string => `${formId}-${field}`;
