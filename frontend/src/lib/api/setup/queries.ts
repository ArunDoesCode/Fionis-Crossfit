import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import { messageForCode } from '@/lib/messages/errors';
import { SETUP_TEXT } from '@/lib/setup/text';
import {
  type AssessmentType,
  type CreateAssessmentTypeBody,
  type CreateMetricBody,
  createAssessmentType,
  createMetric,
  getSettings,
  listAssessmentTypes,
  reorderAssessmentTypes,
  reorderMetrics,
  type UpdateAssessmentTypeBody,
  type UpdateMetricBody,
  type UpdateSettingsBody,
  updateAssessmentType,
  updateMetric,
  updateSettings,
} from './fetchers';

export const setupKeys = {
  all: ['setup'] as const,
  settings: () => [...setupKeys.all, 'settings'] as const,
  catalog: (includeInactive: boolean) =>
    [...setupKeys.all, 'catalog', { includeInactive }] as const,
};

/** Every catalog read, with or without off items (one prefix for the optimistic reorder). */
const CATALOG_KEYS = [...setupKeys.all, 'catalog'] as const;

/** Mutation keys: for "is it saving" checks (`useIsMutating`) and to tell reorders apart. */
export const setupMutationKeys = {
  updateSettings: () => ['setup-write', 'update-settings'] as const,
  reorder: () => ['setup-write', 'reorder'] as const,
  reorderTypes: () => [...setupMutationKeys.reorder(), 'assessments'] as const,
  reorderMetrics: () => [...setupMutationKeys.reorder(), 'measurements'] as const,
};

// BR-REC-72: every open asks the server again (`staleTime: 0`, the app default of 30 s would not); the
// client's ETag cache turns an unchanged answer into a 304, so this is cheap.
export const settingsQueryOptions = () =>
  queryOptions({ queryKey: setupKeys.settings(), queryFn: getSettings, staleTime: 0 });

export const assessmentTypesQueryOptions = (includeInactive: boolean) =>
  queryOptions({
    queryKey: setupKeys.catalog(includeInactive),
    queryFn: () => listAssessmentTypes(includeInactive),
    staleTime: 0,
  });

/** E07. */
export const useSettings = () => useQuery(settingsQueryOptions());

/** E09. The setup screens pass `true` so off assessments and measurements can be turned on again. */
export const useAssessmentTypes = (includeInactive: boolean) =>
  useQuery(assessmentTypesQueryOptions(includeInactive));

// A 401 is the global handler's (it opens Login); `NAME_TAKEN` is shown by the form next to the name.
function toastFailure(err: unknown, fallback: string, skipCodes: readonly string[] = []) {
  if (isApiError(err)) {
    if (err.status === 401 || (err.code !== undefined && skipCodes.includes(err.code))) return;
    toast.error(messageForCode(err.code));
    return;
  }
  toast.error(fallback);
}

const refreshSetup = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: setupKeys.all });

/** E08: the reminders and gym form. */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: setupMutationKeys.updateSettings(),
    mutationFn: (body: UpdateSettingsBody) => updateSettings(body),
    onSuccess: () => {
      toast.success(SETUP_TEXT.toasts.settingsSaved);
      return refreshSetup(queryClient);
    },
    onError: (err) => toastFailure(err, SETUP_TEXT.toasts.notSaved),
  });
}

/** E10. */
export function useCreateAssessmentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAssessmentTypeBody) => createAssessmentType(body),
    onSuccess: () => {
      toast.success(SETUP_TEXT.toasts.assessmentAdded);
      return refreshSetup(queryClient);
    },
    onError: (err) => toastFailure(err, SETUP_TEXT.toasts.notSaved, ['NAME_TAKEN']),
  });
}

/** E11: rename, repeat, On/Off. */
export function useUpdateAssessmentType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, body }: { typeId: string; body: UpdateAssessmentTypeBody }) =>
      updateAssessmentType(typeId, body),
    onSuccess: () => {
      toast.success(SETUP_TEXT.toasts.changesSaved);
      return refreshSetup(queryClient);
    },
    onError: (err) => toastFailure(err, SETUP_TEXT.toasts.notSaved, ['NAME_TAKEN']),
  });
}

/** E13. */
export function useCreateMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, body }: { typeId: string; body: CreateMetricBody }) =>
      createMetric(typeId, body),
    onSuccess: () => {
      toast.success(SETUP_TEXT.toasts.measurementAdded);
      return refreshSetup(queryClient);
    },
    onError: (err) => toastFailure(err, SETUP_TEXT.toasts.notSaved, ['NAME_TAKEN']),
  });
}

/** E14. `METRIC_LOCKED` is a toast: the sheet locks the fields first, so this is a safety net. */
export function useUpdateMetric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ metricId, body }: { metricId: string; body: UpdateMetricBody }) =>
      updateMetric(metricId, body),
    onSuccess: () => {
      toast.success(SETUP_TEXT.toasts.changesSaved);
      return refreshSetup(queryClient);
    },
    onError: (err) => {
      toastFailure(err, SETUP_TEXT.toasts.notSaved, ['NAME_TAKEN']);
      // Results arrived from another device since the sheet opened: read the catalog again.
      if (isApiError(err) && err.code === 'METRIC_LOCKED') return refreshSetup(queryClient);
    },
  });
}

type CatalogSnapshot = ReturnType<QueryClient['getQueriesData']>;

/** `items` in the order of `ids`; anything not listed keeps its place after the listed ones. */
function inOrderOf<T extends { id: string }>(items: readonly T[], ids: readonly string[]): T[] {
  const place = new Map(ids.map((id, index) => [id, index]));
  const rank = (item: T) => place.get(item.id) ?? ids.length;
  return [...items].sort((a, b) => rank(a) - rank(b));
}

// BR-REC-67 + contract "Catalog freshness": the new order shows at once; a failed call puts the old one
// back with a toast. Several quick taps overlap, so the catalog is re-read only when the last one ends.
function useReorder<Variables>(options: {
  mutationKey: readonly unknown[];
  mutationFn: (variables: Variables) => Promise<void>;
  reorderCache: (catalog: AssessmentType[], variables: Variables) => AssessmentType[];
}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: options.mutationKey,
    mutationFn: options.mutationFn,
    onMutate: async (variables: Variables): Promise<{ snapshot: CatalogSnapshot }> => {
      await queryClient.cancelQueries({ queryKey: CATALOG_KEYS });
      const snapshot = queryClient.getQueriesData({ queryKey: CATALOG_KEYS });
      queryClient.setQueriesData<AssessmentType[]>({ queryKey: CATALOG_KEYS }, (catalog) =>
        catalog ? options.reorderCache(catalog, variables) : catalog,
      );
      return { snapshot };
    },
    onError: (err, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toastFailure(err, SETUP_TEXT.toasts.notMoved);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: setupMutationKeys.reorder() }) > 1) return;
      return refreshSetup(queryClient);
    },
  });
}

/** E12: `typeIds` is the whole new order. */
export const useReorderAssessmentTypes = () =>
  useReorder<string[]>({
    mutationKey: setupMutationKeys.reorderTypes(),
    mutationFn: reorderAssessmentTypes,
    reorderCache: (catalog, typeIds) => inOrderOf(catalog, typeIds),
  });

/** E15: `metricIds` is the whole new order of one assessment's measurements. */
export const useReorderMetrics = () =>
  useReorder<{ typeId: string; metricIds: string[] }>({
    mutationKey: setupMutationKeys.reorderMetrics(),
    mutationFn: ({ typeId, metricIds }) => reorderMetrics(typeId, metricIds),
    reorderCache: (catalog, { typeId, metricIds }) =>
      catalog.map((assessment) =>
        assessment.id === typeId
          ? { ...assessment, metrics: inOrderOf(assessment.metrics, metricIds) }
          : assessment,
      ),
  });
