import type { Control, FieldErrors } from 'react-hook-form';
import type { EntryFormInput, EntryFormValues } from '@/lib/validators/assessments';

/** The name React Hook Form (and `data-field`) uses for a measurement's box. */
export const valueName = (metricId: string): `values.${string}` => `values.${metricId}`;

/** Field names in screen order: the date, then the measurements. */
export const entryOrder = (metricIds: readonly string[]): string[] => [
  'date',
  ...metricIds.map(valueName),
];

/** The form's nested errors as one level by field name (`date`, `values.<id>`), the shape the summary and focus helpers read. */
export function flatErrors(errors: FieldErrors): FieldErrors {
  const flat: Record<string, unknown> = {};
  if (errors.date) flat.date = errors.date;
  const values = errors.values;
  if (values && typeof values === 'object') {
    for (const [id, error] of Object.entries(values)) flat[valueName(id)] = error;
  }
  return flat as FieldErrors;
}

/** The form's control as the field components read it (they only need the typed values, not the schema's output). */
export type EntryControl = Control<EntryFormInput, unknown, EntryFormValues>;
