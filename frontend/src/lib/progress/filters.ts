import type { Plan, Sex } from '@/lib/members/types';
import type { operations } from '@/types/api.generated';

// S13 filters (BR-REC-111, P11): the address is the state, so a view can be bookmarked. Pure: no DOM.

type StatsQuery = operations['getApiReportsProgress']['parameters']['query'];

export type { Plan, Sex };
/** BR-REC-114: `under20`, `20to29` … `60plus`. */
export type AgeBand = NonNullable<StatsQuery['ageBand']>;

/** The E36 query: the measurement and the filters that are set. */
export type ProgressStatsQuery = StatsQuery;

export interface ProgressFilters {
  metricId?: string;
  /** `YYYY-MM` */
  joinedFrom?: string;
  /** `YYYY-MM` */
  joinedTo?: string;
  plan?: Plan;
  sex?: Sex;
  ageBand?: AgeBand;
}

export const PLANS = [
  'monthly',
  'quarterly',
  'half_annual',
  'annual',
] as const satisfies readonly Plan[];
export const SEXES = ['male', 'female'] as const satisfies readonly Sex[];
export const AGE_BANDS = [
  'under20',
  '20to29',
  '30to39',
  '40to49',
  '50to59',
  '60plus',
] as const satisfies readonly AgeBand[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

type Params = Record<string, string | string[] | undefined>;

/** A repeated key gives its first entry. */
const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const oneOf = <T extends string>(options: readonly T[], value: string | undefined): T | undefined =>
  options.find((option) => option === value);

/**
 * Reads the S13 address keys `metric`, `joinedFrom`, `joinedTo`, `plan`, `sex`, `age`. A value is kept only
 * when it is valid, anything else is dropped; months the wrong way round are swapped (P11).
 */
export function parseProgressFilters(params: Params): ProgressFilters {
  const filters: ProgressFilters = {};

  const metric = first(params.metric);
  if (metric !== undefined && UUID.test(metric)) filters.metricId = metric;

  let from = first(params.joinedFrom);
  let to = first(params.joinedTo);
  if (from !== undefined && !MONTH.test(from)) from = undefined;
  if (to !== undefined && !MONTH.test(to)) to = undefined;
  if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
  if (from !== undefined) filters.joinedFrom = from;
  if (to !== undefined) filters.joinedTo = to;

  const plan = oneOf(PLANS, first(params.plan));
  if (plan) filters.plan = plan;
  const sex = oneOf(SEXES, first(params.sex));
  if (sex) filters.sex = sex;
  const ageBand = oneOf(AGE_BANDS, first(params.age));
  if (ageBand) filters.ageBand = ageBand;

  return filters;
}

/** `""` when nothing is set, else `?` and the keys in the order metric, joinedFrom, joinedTo, plan, sex, age. */
export function progressFiltersSearch(filters: ProgressFilters): string {
  const search = new URLSearchParams();
  if (filters.metricId) search.set('metric', filters.metricId);
  if (filters.joinedFrom) search.set('joinedFrom', filters.joinedFrom);
  if (filters.joinedTo) search.set('joinedTo', filters.joinedTo);
  if (filters.plan) search.set('plan', filters.plan);
  if (filters.sex) search.set('sex', filters.sex);
  if (filters.ageBand) search.set('age', filters.ageBand);
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/** The E36 query: the measurement and only the filters that are set. */
export function toProgressQuery(metricId: string, filters: ProgressFilters): ProgressStatsQuery {
  const query: ProgressStatsQuery = { metricId };
  if (filters.joinedFrom) query.joinedFrom = filters.joinedFrom;
  if (filters.joinedTo) query.joinedTo = filters.joinedTo;
  if (filters.plan) query.plan = filters.plan;
  if (filters.sex) query.sex = filters.sex;
  if (filters.ageBand) query.ageBand = filters.ageBand;
  return query;
}

/** What `pickDefaultMetricId` needs of E09: assessments with their measurements, in setup order. */
interface CatalogItem {
  isActive: boolean;
  metrics: readonly { id: string; name: string; isActive: boolean }[];
}

/**
 * P11: the first measurement that is on (in an assessment that is on) whose name starts with "Body fat",
 * any case; else the first one that is on; `null` when none.
 */
export function pickDefaultMetricId(catalog: readonly CatalogItem[]): string | null {
  const metrics = catalog
    .filter((type) => type.isActive)
    .flatMap((type) => type.metrics.filter((metric) => metric.isActive));
  const bodyFat = metrics.find((metric) => metric.name.trim().toLowerCase().startsWith('body fat'));
  return (bodyFat ?? metrics[0])?.id ?? null;
}
