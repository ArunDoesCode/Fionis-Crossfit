import { durationFromParts } from '@/lib/domain/duration';

// What the two time boxes hold right now (BR-REC-75, 134). Kept next to, not inside, `domain/duration.ts`
// because that file is mirrored with the backend.

/** `empty`: both boxes blank. `valid`: whole minutes 0-599 and seconds 0-59 (a blank box counts as 0). `invalid`: anything else. */
export type DurationStatus = 'empty' | 'valid' | 'invalid';

export const durationStatus = (minText: string, secText: string): DurationStatus => {
  if (minText === '' && secText === '') return 'empty';
  return durationFromParts(Number(minText || '0'), Number(secText || '0')) === null
    ? 'invalid'
    : 'valid';
};
