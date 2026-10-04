import {
  infiniteQueryOptions,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { UpdateAssessmentBody } from '@/lib/assessments/types';
import { deleteAssessment, getAssessment, listAssessments, updateAssessment } from './fetchers';
import {
  ASSESSMENT_PAGE_SIZE,
  type AssessmentListFilter,
  assessmentKeys,
  invalidateAssessmentData,
  RECENT_SIZE,
} from './queries';

// The reads of "All assessments" (S11), the member page's Recent block and the saved-assessment sheet, and
// the two writes made from them. Kept apart from `queries.ts` so Record assessment (S10) does not carry
// the list, infinite-query and delete code (BR-REC-146): only S11 and the Recent block import this file.

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
 * as the BR-REC-87 sentence; a success refreshes every read (BR-REC-88). No screen calls it yet (D21).
 */
export function useUpdateAssessment(assessmentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateAssessmentBody) => updateAssessment(assessmentId, body),
    onSuccess: () => {
      toast.success(ASSESSMENT_TEXT.saved);
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
      toast.success(ASSESSMENT_TEXT.deleted);
      void invalidateAssessmentData(queryClient);
    },
  });
}
