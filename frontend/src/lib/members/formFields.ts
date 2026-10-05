/** The fields of S6/S8/S9 in screen order: "Save" jumps to the first one with a problem (BR-REC-189). */
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

/** The label of each field: on the field itself and as the link text in the "things to fix" summary. */
export const MEMBER_FIELD_LABELS = {
  fullName: 'Full name',
  phone: 'Phone',
  dateOfBirth: 'Date of birth',
  sex: 'Sex',
  joinedOn: 'Joined on',
  plan: 'Membership',
  startOn: 'Starts on',
  email: 'Email',
  objective: 'Goal',
  notes: 'Notes',
} as const satisfies Record<(typeof MEMBER_FORM_ORDER)[number], string>;

/** The question asked when Add / Edit member is left with typing that is not saved (#49). */
export const LEAVE_FORM_TEXT = {
  title: 'Leave without saving?',
  body: 'What you typed here will be lost.',
  stay: 'Stay',
  leave: 'Leave',
} as const;
