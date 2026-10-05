import {
  type QueryClient,
  type QueryKey,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { savedMessage } from '@/lib/assessments/labels';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { SaveAssessmentBody } from '@/lib/assessments/types';
import { getEntryForm, getMemberDue, saveAssessment } from './fetchers';

// What Record assessment (S10) needs: the keys, the entry form (E25), Save (E26) and the due words (E32). The
// list, detail, update and delete code is in `listQueries.ts`, so this page does not load it (BR-REC-146).

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
/**
 * `memberKeys.lists()` in `lib/api/members/queries.ts`: a save changes a member's `lastAssessedOn`, so the
 * lists (and the directory) refresh; never the whole `['members']` root (BR-REC-209). Written here, not imported, because that module's lists, search and member
 * writes would load with the Record assessment page (BR-REC-146).
 */
const MEMBER_LISTS = ['members', 'list'] as const;
const MEMBER_DETAILS = ['members', 'detail'] as const;
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
    queryClient.invalidateQueries({ queryKey: MEMBER_LISTS }),
    queryClient.invalidateQueries({ queryKey: MEMBER_DETAILS }),
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

/** The request body plus what the toast needs: how many measurements are still empty after this save (BR-REC-230). */
export type SaveAssessmentInput = SaveAssessmentBody & { stillDue?: number };

/**
 * E26. The toast is the BR-REC-84 line ("Saved 9 results for Surya"), or for a partial save "Saved 3 for Naveen
 * Kumar · 12 still due" (BR-REC-230). The form shows every refusal itself, next
 * to the Save bar (BR-REC-78, 83, 86), so there is no error toast here. Invalidation is not waited for:
 * the screen leaves at once and the lists refetch when they are next shown.
 */
export function useSaveAssessment(memberName: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: assessmentMutationKeys.save(),
    mutationFn: ({ stillDue: _stillDue, ...body }: SaveAssessmentInput) => saveAssessment(body),
    onSuccess: (result, { stillDue }) => {
      // About changed and no value written (an edit that touches nothing else): there is no count to say.
      toast.success(
        result.saved === 0
          ? ASSESSMENT_TEXT.saved
          : savedMessage(result.saved, memberName, stillDue),
      );
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
