import {
  type InfiniteData,
  infiniteQueryOptions,
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import type { IsoDate } from '@/lib/domain/dates';
import { applyDueChange, applyMemberDueChange } from '@/lib/due/optimistic';
import { DUE_TEXT } from '@/lib/due/text';
import type {
  DueActionResult,
  DueChange,
  DueListItem,
  DueListPage,
  DueListStatus,
  MemberDueItem,
} from '@/lib/due/types';
import { formatDay } from '@/lib/format';
import { gymTodayNow } from '@/lib/members/useToday';
import { messageForCode } from '@/lib/messages/errors';
import { deleteDueAction, fetchDueList, fetchMemberDue, putDueAction } from './fetchers';

/** BR-REC-101: a Home section shows the first 5 rows and links "See all". */
export const DUE_PREVIEW_SIZE = 5;
/** BR-REC-104: S3 asks 25 at a time and adds the next page under "Show more". */
export const DUE_PAGE_SIZE = 25;

/**
 * Every due query sits under `all`: one invalidate after a write (or a setup / assessment change) reaches the
 * one-page lists (Home), the pages that append (S3) and the member page lines. A one-page list and an
 * infinite list never share an entry: their data shapes differ.
 */
export const dueKeys = {
  all: ['due'] as const,
  list: (status: DueListStatus, typeId: string | null, pageSize: number) =>
    [...dueKeys.all, 'list', status, typeId, pageSize] as const,
  infinite: (status: DueListStatus, typeId: string | null) =>
    [...dueKeys.all, 'infinite', status, typeId] as const,
  member: (memberId: string) => [...dueKeys.all, 'member', memberId] as const,
};

/** For `isMutating`: two quick changes read the lists again only when the last one ends. */
const DUE_WRITE_KEY = ['due-write'] as const;

// C13 / R-6: every visit asks the server again (`staleTime: 0`; the app default of 30 s would show a due
// list from before a setup or assessment change). The client's ETag cache makes an unchanged answer cheap.

/** E31, one page: Home's first 5 of a tab. */
export const dueListQueryOptions = (
  status: DueListStatus,
  typeId: string | null,
  pageSize: number,
) =>
  queryOptions({
    queryKey: dueKeys.list(status, typeId, pageSize),
    queryFn: ({ signal }) => fetchDueList({ status, typeId, page: 1, pageSize }, signal),
    staleTime: 0,
  });

/** E31, pages that append: S3, 25 at a time. */
export const dueInfiniteQueryOptions = (status: DueListStatus, typeId: string | null) =>
  infiniteQueryOptions({
    queryKey: dueKeys.infinite(status, typeId),
    queryFn: ({ pageParam, signal }) =>
      fetchDueList({ status, typeId, page: pageParam, pageSize: DUE_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    staleTime: 0,
  });

/** E32: the Assessments block of one member. */
export const memberDueQueryOptions = (memberId: string) =>
  queryOptions({
    queryKey: dueKeys.member(memberId),
    queryFn: ({ signal }) => fetchMemberDue(memberId, signal),
    staleTime: 0,
  });

/** Home (BR-REC-101, 131): the first 5 rows and the total of a section, each section with its own state. */
export const useDuePreview = (status: DueListStatus) =>
  useQuery(dueListQueryOptions(status, null, DUE_PREVIEW_SIZE));

/**
 * S3 (BR-REC-104): 25 rows a page for one tab and one assessment (or all). While the tab or the chip
 * changes, the old rows stay on screen (dimmed) instead of flashing grey shapes.
 */
export const useDueList = (status: DueListStatus, typeId: string | null) =>
  useInfiniteQuery({
    ...dueInfiniteQueryOptions(status, typeId),
    placeholderData: keepPreviousData,
  });

/** E32 (BR-REC-103, C10): the member page lines. */
export const useMemberDue = (memberId: string) => useQuery(memberDueQueryOptions(memberId));

// ---------------------------------------------------------------------------------------------------------
// Writes: Assess soon, Remind me later, remove (perf tactic 8, C13).

type Snapshot = ReturnType<QueryClient['getQueriesData']>;

const isListPage = (data: unknown): data is DueListPage =>
  typeof data === 'object' && data !== null && Array.isArray((data as { data?: unknown }).data);

const isInfinite = (data: unknown): data is InfiniteData<DueListPage, number> =>
  typeof data === 'object' && data !== null && Array.isArray((data as { pages?: unknown }).pages);

const isStatus = (value: unknown): value is DueListStatus =>
  value === 'overdue' || value === 'upcoming';

/**
 * The pages of an infinite list after `change`. The change is applied to the whole list, so an Assess soon
 * row moves to the top of the first page, not just to the top of its own page; the pages keep the sizes they
 * had (the last one takes what is left). `meta` is untouched: the totals are read again afterwards.
 */
function changePages(
  pages: DueListPage[],
  change: DueChange,
  status: DueListStatus,
): DueListPage[] {
  const rows = pages.flatMap((page) => page.data);
  const changed = applyDueChange(rows, change, status);
  if (changed === rows) return pages;
  let offset = 0;
  return pages.map((page, index) => {
    const size =
      index === pages.length - 1 ? Math.max(0, changed.length - offset) : page.data.length;
    const data: DueListItem[] = changed.slice(offset, offset + size);
    offset += size;
    return { ...page, data };
  });
}

/** What one cached due query becomes after `change`, or the same data when it is not affected. */
function changeEntry(key: QueryKey, data: unknown, change: DueChange): unknown {
  const [, kind, scope] = key;
  if (kind === 'list' && isStatus(scope) && isListPage(data)) {
    return { ...data, data: applyDueChange(data.data, change, scope) };
  }
  if (kind === 'infinite' && isStatus(scope) && isInfinite(data)) {
    return { ...data, pages: changePages(data.pages, change, scope) };
  }
  if (kind === 'member' && scope === change.memberId && Array.isArray(data)) {
    return applyMemberDueChange(data as MemberDueItem[], change);
  }
  return data;
}

interface DueContext {
  /** Every due query as it was before the change, to put back when the call fails. */
  snapshot: Snapshot;
}

// Stops reads that are already running (their old answer would overwrite the change), remembers every due
// query, then shows the change in every cached list of both tabs, every page of an infinite one, and that
// member's lines.
async function showChange(queryClient: QueryClient, change: DueChange): Promise<DueContext> {
  await queryClient.cancelQueries({ queryKey: dueKeys.all });
  const snapshot = queryClient.getQueriesData({ queryKey: dueKeys.all });
  for (const [key, data] of snapshot) {
    if (data === undefined) continue;
    const next = changeEntry(key, data, change);
    if (next !== data) queryClient.setQueryData(key, next);
  }
  return { snapshot };
}

function undoChange(queryClient: QueryClient, context: DueContext | undefined) {
  for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
}

// A 401 is the global handler's (it opens Login); a server code is one plain sentence (BR-REC-128);
// anything else (offline, timeout) says the change was not saved.
function saveFailed(err: unknown) {
  if (isApiError(err)) {
    if (err.status !== 401) toast.error(messageForCode(err.code));
    return;
  }
  toast.error(DUE_TEXT.toasts.notSaved);
}

// The lists are read again once the last change has ended (an earlier answer would otherwise wipe a later
// change that the server has not confirmed yet). Not awaited: the sheet is already closed.
function refreshDue(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: DUE_WRITE_KEY }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: dueKeys.all });
}

/** What `useSetDueAction` takes: Assess soon, or Remind me later with its day. */
export type SetDueChange =
  | { memberId: string; typeId: string; action: 'flag' }
  | { memberId: string; typeId: string; action: 'snooze'; until: IsoDate };

/**
 * E33. Assess soon and Remind me later replace each other (BR-REC-100). The lists change at once; a failed
 * call puts every touched list back and says why; the lists are read again when it ends.
 */
export function useSetDueAction() {
  const queryClient = useQueryClient();
  return useMutation<DueActionResult, Error, SetDueChange, DueContext>({
    mutationKey: DUE_WRITE_KEY,
    mutationFn: (change) =>
      putDueAction(
        change.memberId,
        change.typeId,
        change.action === 'flag' ? { action: 'flag' } : { action: 'snooze', until: change.until },
      ),
    onMutate: (change) => showChange(queryClient, change),
    onError: (err, _change, context) => {
      undoChange(queryClient, context);
      saveFailed(err);
    },
    onSuccess: (_result, change) => {
      toast.success(
        change.action === 'flag'
          ? DUE_TEXT.toasts.markedAssessSoon
          : DUE_TEXT.toasts.reminderSet(formatDay(change.until, gymTodayNow())),
      );
    },
    onSettled: () => refreshDue(queryClient),
  });
}

/** E34: remove Assess soon or the reminder (same undo and refresh as `useSetDueAction`). */
export function useClearDueAction() {
  const queryClient = useQueryClient();
  return useMutation<
    Record<string, never>,
    Error,
    { memberId: string; typeId: string },
    DueContext
  >({
    mutationKey: DUE_WRITE_KEY,
    mutationFn: ({ memberId, typeId }) => deleteDueAction(memberId, typeId),
    onMutate: (target) => showChange(queryClient, { ...target, action: 'clear' }),
    onError: (err, _target, context) => {
      undoChange(queryClient, context);
      saveFailed(err);
    },
    onSuccess: () => {
      toast.success(DUE_TEXT.toasts.removed);
    },
    onSettled: () => refreshDue(queryClient),
  });
}
