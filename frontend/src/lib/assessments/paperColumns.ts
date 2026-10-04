import { addMonths, type IsoDate } from '@/lib/domain/dates';

/** The months between the paper columns Q1–Q4 (BR-REC-79, D16): the join date, then every 3 months. */
const MONTHS_BETWEEN_COLUMNS = 3;

/** Q1–Q4 → join date + 0 / 3 / 6 / 9 calendar months, clamped to the month end (31 Aug, Q2 → 30 Nov). */
export const paperColumnDate = (joinedOn: IsoDate, column: 1 | 2 | 3 | 4): IsoDate =>
  addMonths(joinedOn, (column - 1) * MONTHS_BETWEEN_COLUMNS);
