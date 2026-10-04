import type { Control, FieldValues } from 'react-hook-form';
import type {
  MemberEditFormInput,
  MemberEditFormValues,
  PeriodFormInput,
  PeriodFormValues,
} from '@/lib/validators/members';

/**
 * What the fields shared by S6 and S8 know about their form: the member fields only. The Add form also
 * has plan and start date; it hands over its control through `asMemberControl`, the one cast, because
 * a control of the bigger form is a control of this one for every field these components touch.
 */
export type MemberFormControl = Control<MemberEditFormInput, unknown, MemberEditFormValues>;

export const asMemberControl = <T extends MemberEditFormInput, Output extends FieldValues>(
  control: Control<T, unknown, Output>,
): MemberFormControl => control as unknown as MemberFormControl;

/** The membership fields (plan, start date) shared by S6 and S9; the Add form hands over its control the same way. */
export type PeriodFormControl = Control<PeriodFormInput, unknown, PeriodFormValues>;

export const asPeriodControl = <T extends PeriodFormInput, Output extends FieldValues>(
  control: Control<T, unknown, Output>,
): PeriodFormControl => control as unknown as PeriodFormControl;
