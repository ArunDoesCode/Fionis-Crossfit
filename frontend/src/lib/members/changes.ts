import type { MemberDetail, UpdateMemberBody } from './types';

type Stored = Pick<
  MemberDetail,
  'fullName' | 'phone' | 'email' | 'dateOfBirth' | 'sex' | 'joinedOn' | 'objective' | 'notes'
>;

/**
 * What an Edit member save sends (E19): only the fields that differ from what is stored, so a save
 * never touches what the trainer did not change. Empty = nothing changed (no request needed).
 * `values` are the cleaned form values; optional fields are `null` when empty and `null` clears one.
 */
export function changedMemberFields(
  values: {
    [K in keyof Stored]: Stored[K] | undefined;
  },
  stored: Stored,
): UpdateMemberBody {
  const changes: UpdateMemberBody = {};
  if (values.fullName !== undefined && values.fullName !== stored.fullName) {
    changes.fullName = values.fullName;
  }
  if (values.phone !== undefined && values.phone !== stored.phone) changes.phone = values.phone;
  if (values.email !== undefined && values.email !== stored.email) changes.email = values.email;
  if (values.dateOfBirth !== undefined && values.dateOfBirth !== stored.dateOfBirth) {
    changes.dateOfBirth = values.dateOfBirth;
  }
  if (values.sex !== undefined && values.sex !== stored.sex) changes.sex = values.sex;
  if (values.joinedOn !== undefined && values.joinedOn !== stored.joinedOn) {
    changes.joinedOn = values.joinedOn;
  }
  if (values.objective !== undefined && values.objective !== stored.objective) {
    changes.objective = values.objective;
  }
  if (values.notes !== undefined && values.notes !== stored.notes) changes.notes = values.notes;
  return changes;
}
