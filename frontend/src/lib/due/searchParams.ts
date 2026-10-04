import { createParser, parseAsStringLiteral } from 'nuqs/server';
import type { DueTab } from './types';

export const DUE_TABS = ['overdue', 'soon'] as const satisfies readonly DueTab[];

/** Any 8-4-4-4-12 hex id, the shape the API accepts (contract "All four endpoints"). */
const ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?tab=` and `?type=` of `/admin/due` (BR-REC-104): the tab (default Overdue) and the assessment filter (default All). */
export const dueListSearchParams = {
  tab: parseAsStringLiteral(DUE_TABS).withDefault('overdue'),
  type: createParser<string>({
    parse: (value) => (ID_SHAPE.test(value) ? value : null),
    serialize: (value) => value,
  }),
};

/** The tab from a text: "soon", or Overdue for anything else (also nothing). */
export const parseDueTab = (value: string | null): DueTab =>
  value === 'soon' ? 'soon' : 'overdue';

export const isDueTab = (value: unknown): value is DueTab => DUE_TABS.some((tab) => tab === value);
