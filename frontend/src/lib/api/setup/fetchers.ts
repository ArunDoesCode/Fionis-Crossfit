import { api } from '@/lib/api/client';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import type { operations } from '@/types/api.generated';

// E07–E15 (api-contract.md, setup.md). Success is `{ success: true, data }`; the fetchers hand back `data`. Failures throw
// ApiError. Types come from the generated contract.
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Reply<Name extends keyof operations, Status extends number> = operations[Name] extends {
  responses: Record<Status, infer R>;
}
  ? Json<R>
  : never;
type RequestBody<Name extends keyof operations> = operations[Name] extends {
  requestBody: infer B;
}
  ? Json<B>
  : never;

export type Settings = Reply<'getApiSettings', 200>['data'];
export type AssessmentType = Reply<'getApiAssessment-types', 200>['data'][number];
export type Metric = AssessmentType['metrics'][number];

export type UpdateSettingsBody = RequestBody<'patchApiSettings'>;
export type CreateAssessmentTypeBody = RequestBody<'postApiAssessment-types'>;
export type UpdateAssessmentTypeBody = RequestBody<'patchApiAssessment-typesTypeId'>;
export type CreateMetricBody = RequestBody<'postApiAssessment-typesTypeIdMetrics'>;
export type UpdateMetricBody = RequestBody<'patchApiMetricsMetricId'>;

/** One page of 100 holds the whole catalog, and E12 needs every assessment in one list (api-contract.md E09). */
export const CATALOG_PAGE_SIZE = 100;

/** E07 */
export async function getSettings(): Promise<Settings> {
  const res = await api.get<Reply<'getApiSettings', 200>>(API_ROUTES.SETTINGS.GET);
  return res.data;
}

/** E08: only the fields sent change; the answer is the whole row. */
export async function updateSettings(body: UpdateSettingsBody): Promise<Settings> {
  const res = await api.patch<Reply<'patchApiSettings', 200>, UpdateSettingsBody>(
    API_ROUTES.SETTINGS.UPDATE,
    body,
  );
  return res.data;
}

/** E09: every assessment with its measurements, in setup order (BR-REC-67). */
export async function listAssessmentTypes(includeInactive: boolean): Promise<AssessmentType[]> {
  const res = await api.get<Reply<'getApiAssessment-types', 200>>(
    API_ROUTES.ASSESSMENT_TYPES.LIST,
    {
      query: { includeInactive: includeInactive ? 'true' : 'false', pageSize: CATALOG_PAGE_SIZE },
    },
  );
  return res.data;
}

/** E10 (201) */
export async function createAssessmentType(
  body: CreateAssessmentTypeBody,
): Promise<AssessmentType> {
  const res = await api.post<Reply<'postApiAssessment-types', 201>, CreateAssessmentTypeBody>(
    API_ROUTES.ASSESSMENT_TYPES.CREATE,
    body,
  );
  return res.data;
}

/** E11: only the fields sent change; the answer lists all of the assessment's measurements. */
export async function updateAssessmentType(
  typeId: string,
  body: UpdateAssessmentTypeBody,
): Promise<AssessmentType> {
  const res = await api.patch<
    Reply<'patchApiAssessment-typesTypeId', 200>,
    UpdateAssessmentTypeBody
  >(apiPath(API_ROUTES.ASSESSMENT_TYPES.UPDATE, { typeId }), body);
  return res.data;
}

/** E12: `typeIds` lists every assessment once, in the new order. */
export async function reorderAssessmentTypes(typeIds: string[]): Promise<void> {
  await api.put<Reply<'putApiAssessment-typesOrder', 200>, { typeIds: string[] }>(
    API_ROUTES.ASSESSMENT_TYPES.ORDER,
    { typeIds },
  );
}

/** E13 (201) */
export async function createMetric(typeId: string, body: CreateMetricBody): Promise<Metric> {
  const res = await api.post<Reply<'postApiAssessment-typesTypeIdMetrics', 201>, CreateMetricBody>(
    apiPath(API_ROUTES.ASSESSMENT_TYPES.METRICS, { typeId }),
    body,
  );
  return res.data;
}

/** E14: only the fields sent change. */
export async function updateMetric(metricId: string, body: UpdateMetricBody): Promise<Metric> {
  const res = await api.patch<Reply<'patchApiMetricsMetricId', 200>, UpdateMetricBody>(
    apiPath(API_ROUTES.METRICS.UPDATE, { metricId }),
    body,
  );
  return res.data;
}

/** E15: `metricIds` lists every measurement of the assessment once, in the new order. */
export async function reorderMetrics(typeId: string, metricIds: string[]): Promise<void> {
  await api.put<Reply<'putApiAssessment-typesTypeIdMetric-order', 200>, { metricIds: string[] }>(
    apiPath(API_ROUTES.ASSESSMENT_TYPES.METRIC_ORDER, { typeId }),
    { metricIds },
  );
}
