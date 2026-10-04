import { ageOn, type IsoDate, isIsoDate } from '@/lib/domain/dates';

export const CHECK_DATE_WARNING = 'Please check the date';

/**
 * BR-REC-48: an age under 10 or over 100 only warns, it never blocks saving. A date that is not a real
 * day, or one after `today`, has its own error and gets no warning here.
 */
export const birthDateWarning = (dateOfBirth: IsoDate, today: IsoDate): string | null => {
  if (!isIsoDate(dateOfBirth) || !isIsoDate(today) || dateOfBirth > today) return null;
  const age = ageOn(dateOfBirth, today);
  return age < 10 || age > 100 ? CHECK_DATE_WARNING : null;
};
