import type { Control, FieldValues } from 'react-hook-form';
import type { MemberEditFormInput, MemberEditFormValues } from '@/lib/validators/members';

/**
 * What the fields shared by S6 and S8 know about their form: the member fields only. The Add form also
 * has plan and start date; it hands over its control through `asMemberControl`, the one cast, because
 * a control of the bigger form is a control of this one for every field these components touch.
 */
export type MemberFormControl = Control<MemberEditFormInput, unknown, MemberEditFormValues>;

export const asMemberControl = <T extends MemberEditFormInput, Output extends FieldValues>(
  control: Control<T, unknown, Output>,
): MemberFormControl => control as unknown as MemberFormControl;
