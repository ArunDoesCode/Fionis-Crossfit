import {
  infiniteQueryOptions,
  type QueryClient,
  type QueryKey,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { memberKeys } from '@/lib/api/members/queries';
import { savedMessage } from '@/lib/assessments/labels';
import type { UpdateAssessmentBody } from '@/lib/assessments/types';
import {
  deleteAssessment,
  getAssessment,
  getEntryForm,
  getMemberDue,
  listAssessments,
  saveAssessment,
  updateAssessment,
} from './fetchers';

/** BR-REC-89: "All assessments" asks 25 at a time and adds the next page under "Show more". */
export const ASSESSMENT_PAGE_SIZE = 25;
/** D18: the member page's Recent block shows the latest 3. */
export const RECENT_SIZE = 3;

export interface AssessmentListFilter {
  memberId: string;
  typeId?: string;
}

/** Every key sits under `all`, so one invalidation reaches every read (BR-REC-88). */
export const assessmentKeys = {
  all: ['assessments'] as const,
  entryForm: (memberId: string, typeId: string, date: string) =>
    [...assessmentKeys.all, 'entry-form', memberId, typeId, date] as const,
  lists: () => [...assessmentKeys.all, 'list'] as const,
  list: ({ memberId, typeId }: AssessmentListFilter) =>
    [...assessmentKeys.lists(), { memberId, typeId: typeId ?? null }] as const,
  recent: (memberId: string) => [...assessmentKeys.all, 'recent', memberId] as const,
  detail: (assessmentId: string) => [...assessmentKeys.all, 'detail', assessmentId] as const,
};

/**
 * The due-list stream (E) roots every one of its keys at `'due'`, so a saved, moved or deleted assessment
 * refreshes Home and the member page at once (BR-REC-88). The member's own status (E32) lives under it too.
 */
const DUE_ROOT = ['due'] as const;
const memberDueKey = (memberId: string) => [...DUE_ROOT, 'member', memberId] as const;

/** For `useIsMutating`: the Save buttons follow the form's own request. */
export const assessmentMutationKeys = {
  save: () => ['assessment-write', 'save'] as const,
};

/**
 * BR-REC-20, 81: "previous" must be fresh, so every open asks the server again (`staleTime: 0`; the app's
 * default of 30 s would not). The date is part of the key: another date has other previous values.
 */
export const entryFormQueryOptions = (memberId: string, typeId: string, date: string) =>
  queryOptions({
    queryKey: assessmentKeys.entryForm(memberId, typeId, date),
    queryFn: ({ signal }) => getEntryForm(memberId, typeId, date, signal),
    staleTime: 0,
  });

/**
 * Every successful write (E26, E29, E30) calls this: assessments, members (`lastAssessedOn`) and due lists
 * all show the change at once (BR-REC-88). Resolves when the three have been marked and refetched.
 */
export async function invalidateAssessmentData(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: assessmentKeys.all }),
    queryClient.invalidateQueries({ queryKey: memberKeys.all() }),
    queryClient.invalidateQueries({ queryKey: DUE_ROOT }),
  ]);
}

// While the date changes the old form stays on screen (its measurements are the same list); only the same
// member and assessment may do that, never another member's numbers.
function keepWhileSameForm(
  previous: Awaited<ReturnType<typeof getEntryForm>> | undefined,
  previousQuery: { queryKey: QueryKey } | undefined,
  memberId: string,
  typeId: string | null,
) {
  // key = ['assessments', 'entry-form', memberId, typeId, date]
  const [, , previousMember, previousType] = previousQuery?.queryKey ?? [];
  return previousMember === memberId && previousType === typeId ? previous : undefined;
}

/** E25. `typeId` is null until an assessment is picked; `date` is empty after "Save & next date". */
export const useEntryForm = (memberId: string, typeId: string | null, date: string) =>
  useQuery({
    ...entryFormQueryOptions(memberId, typeId ?? '', date),
    enabled: typeId !== null && date !== '',
    placeholderData: (previous, previousQuery) =>
      keepWhileSameForm(previous, previousQuery, memberId, typeId),
  });

/**
 * E26. The toast is the BR-REC-84 line ("Saved 9 results for Surya"). The form shows every refusal itself, next
 * to the Save bar (BR-REC-78, 83, 86), so there is no error toast here. Invalidation is not waited for:
 * the screen leaves at once and the lists refetch when they are next shown.
 */
export function useSaveAssessment(memberName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: assessmentMutationKeys.save(),
    mutationFn: saveAssessment,
    onSuccess: (result) => {
      toast.success(savedMessage(result.saved, memberName));
      void invalidateAssessmentData(queryClient);
    },
  });
}

export const assessmentQueries = {
  /** S11: 25 at a time, "Show more" adds the next 25 (BR-REC-89). */
  list: (filter: AssessmentListFilter) =>
    infiniteQueryOptions({
      queryKey: assessmentKeys.list(filter),
      queryFn: ({ pageParam, signal }) =>
        listAssessments(
          {
            memberId: filter.memberId,
            typeId: filter.typeId,
            page: pageParam,
            pageSize: ASSESSMENT_PAGE_SIZE,
          },
          signal,
        ),
      initialPageParam: 1,
      getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    }),
  /** The member page's Recent block: the latest 3 (D18). */
  recent: (memberId: string) =>
    queryOptions({
      queryKey: assessmentKeys.recent(memberId),
      queryFn: ({ signal }) =>
        listAssessments({ memberId, page: 1, pageSize: RECENT_SIZE }, signal),
    }),
  detail: (assessmentId: string) =>
    queryOptions({
      queryKey: assessmentKeys.detail(assessmentId),
      queryFn: () => getAssessment(assessmentId),
    }),
};

/** E27 as pages that append ("Show more"). */
export const useAssessmentList = (filter: AssessmentListFilter) =>
  useInfiniteQuery(assessmentQueries.list(filter));

/** E27 with `pageSize=3`. */
export const useRecentAssessments = (memberId: string) =>
  useQuery(assessmentQueries.recent(memberId));

/** E28; `assessmentId` is null until a row is chosen. */
export const useAssessment = (assessmentId: string | null) =>
  useQuery({
    ...assessmentQueries.detail(assessmentId ?? ''),
    enabled: assessmentId !== null,
  });

/**
 * E29: move the date and/or change About (BR-REC-87). `ASSESSMENT_DATE_TAKEN` (409) is the caller's to show
 * as the BR-REC-87 sentence; a success refreshes every read (BR-REC-88).
 */
export function useUpdateAssessment(assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAssessmentBody) => updateAssessment(assessmentId, body),
    onSuccess: () => {
      toast.success('Saved.');
      void invalidateAssessmentData(queryClient);
    },
  });
}

/** E30: the caller's confirm step comes first (BR-REC-88, 133). */
export function useDeleteAssessment(assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteAssessment(assessmentId),
    onSuccess: () => {
      toast.success('Deleted.');
      void invalidateAssessmentData(queryClient);
    },
  });
}

/**
 * E32 for the choose sheet and the "due" tags (BR-REC-73). Quiet by design (D11): no retry, no toast, and
 * a failure (the endpoint may still answer 501) just means no status words.
 */
export const useMemberDue = (memberId: string, enabled = true) =>
  useQuery({
    queryKey: memberDueKey(memberId),
    queryFn: ({ signal }) => getMemberDue(memberId, signal),
    enabled,
    retry: false,
    staleTime: 0,
  });
