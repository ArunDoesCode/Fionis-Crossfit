import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import { duplicatePhoneMatches } from '@/lib/members/duplicates';
import { periodFieldError, serverFieldError } from '@/lib/members/serverErrors';
import type {
  CreateMemberBody,
  CreatePeriodBody,
  EndingStatus,
  MemberDetail,
  MemberStatusFilter,
  UpdateMemberBody,
  UpdatePeriodBody,
} from '@/lib/members/types';
import { messageForCode } from '@/lib/messages/errors';
import {
  archiveMember,
  createMember,
  createPeriod,
  getMember,
  listEndingMemberships,
  listMembers,
  restoreMember,
  updateMember,
  updatePeriod,
} from './fetchers';

/** BR-REC-56, 57: lists ask 25 at a time and add the next page under "Show more". */
export const MEMBER_PAGE_SIZE = 25;
/** BR-REC-101: the Home sections show the first 5 rows and link "See all". */
export const HOME_PREVIEW_SIZE = 5;

export interface MemberListFilters {
  /** Already checked with `isSearchReady`: 2+ characters, trimmed. */
  q?: string;
  status?: MemberStatusFilter;
}

export const memberKeys = {
  all: () => ['members'] as const,
  lists: () => [...memberKeys.all(), 'list'] as const,
  list: (filters: MemberListFilters) => [...memberKeys.lists(), filters] as const,
  details: () => [...memberKeys.all(), 'detail'] as const,
  detail: (memberId: string) => [...memberKeys.details(), memberId] as const,
  duplicatesAll: () => [...memberKeys.all(), 'duplicates'] as const,
  duplicates: (phone: string) => [...memberKeys.duplicatesAll(), phone] as const,
};

/**
 * The Memberships ending lists (E24): `list` = S4 (pages that append), `preview` = the first 5 on Home.
 * Every member write invalidates `all()`: a renewal, an archive or a new join date changes who is listed.
 */
export const membershipKeys = {
  all: () => ['memberships'] as const,
  lists: () => [...membershipKeys.all(), 'list'] as const,
  list: (status: EndingStatus) => [...membershipKeys.lists(), status] as const,
  previews: () => [...membershipKeys.all(), 'preview'] as const,
  preview: (status: EndingStatus) => [...membershipKeys.previews(), status] as const,
};

/** For `useIsMutating`: the page header's Save button follows the form's own request. */
export const memberMutationKeys = {
  create: () => [...memberKeys.all(), 'create'] as const,
  update: (memberId: string) => [...memberKeys.all(), 'update', memberId] as const,
  period: (memberId: string) => [...memberKeys.all(), 'period', memberId] as const,
};

export const memberQueries = {
  list: (filters: MemberListFilters) =>
    infiniteQueryOptions({
      queryKey: memberKeys.list(filters),
      queryFn: ({ pageParam }) =>
        listMembers({ ...filters, page: pageParam, pageSize: MEMBER_PAGE_SIZE }),
      initialPageParam: 1,
      getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    }),
  detail: (memberId: string) =>
    queryOptions({ queryKey: memberKeys.detail(memberId), queryFn: () => getMember(memberId) }),
  /** BR-REC-47: members with the same last 10 digits, archived ones too. `phone` is the cleaned phone. */
  duplicates: (phone: string) =>
    queryOptions({
      queryKey: memberKeys.duplicates(phone),
      queryFn: () => listMembers({ phone, status: 'any', page: 1, pageSize: 10 }),
    }),
};

export const membershipQueries = {
  /** S4: 25 at a time, "Show more" adds the next 25 (BR-REC-57). */
  list: (status: EndingStatus) =>
    infiniteQueryOptions({
      queryKey: membershipKeys.list(status),
      queryFn: ({ pageParam }) =>
        listEndingMemberships({ status, page: pageParam, pageSize: MEMBER_PAGE_SIZE }),
      initialPageParam: 1,
      getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    }),
  /** Home: the first 5 and the total for the count (BR-REC-101). */
  preview: (status: EndingStatus) =>
    queryOptions({
      queryKey: membershipKeys.preview(status),
      queryFn: () => listEndingMemberships({ status, page: 1, pageSize: HOME_PREVIEW_SIZE }),
    }),
};

/**
 * E16 as pages that append ("Show more"). While the filter or search text changes, the old rows stay
 * on screen (`isPlaceholderData`) instead of flashing grey shapes at every keystroke.
 */
export const useMemberList = (filters: MemberListFilters, enabled = true) =>
  useInfiniteQuery({
    ...memberQueries.list(filters),
    enabled,
    placeholderData: keepPreviousData,
  });

/**
 * E18: the member page and Edit member read this. The Renew sheet on a list row asks for the member only
 * once it is opened (`enabled`), and has no member yet (`null`) until a row is chosen.
 */
export const useMember = (memberId: string | null, enabled = true) =>
  useQuery({ ...memberQueries.detail(memberId ?? ''), enabled: enabled && memberId !== null });

/** E24 for S4 (BR-REC-08, 53, 57): "Ends soon" (`expiring`) or "Ended" (`expired`), 25 at a time. */
export const useEndingList = (status: EndingStatus) =>
  useInfiniteQuery(membershipQueries.list(status));

/** E24 for the Home sections (BR-REC-101, 131): the first 5 of each list, each with its own state. */
export const useEndingPreview = (status: EndingStatus) =>
  useQuery(membershipQueries.preview(status));

/**
 * BR-REC-47: the other members who use `phone`. Pass `null` until the field is left with a valid phone.
 * The answer is only a warning (it never blocks saving, BR-REC-04); `selfId` drops the member being edited.
 */
export const useDuplicatePhone = (phone: string | null, selfId?: string) =>
  useQuery({
    ...memberQueries.duplicates(phone ?? ''),
    enabled: phone !== null,
    select: ({ data }) => duplicatePhoneMatches(data, selfId),
  });

// A 401 is the global handler's (it opens Login); everything else is one short sentence (BR-REC-128).
function saveFailed(err: unknown, fallback: string) {
  if (isApiError(err)) {
    if (err.status !== 401) toast.error(messageForCode(err.code));
    return;
  }
  toast.error(fallback);
}
const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

/** After any write every member list, warning and Memberships ending list may have changed. */
function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: memberKeys.all() });
    void queryClient.invalidateQueries({ queryKey: membershipKeys.all() });
  };
}

/** After a write the member is in the cache as the server saved it; every list and warning is stale. */
function useRefreshMembers() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateMembers();
  return (member: MemberDetail) => {
    queryClient.setQueryData(memberKeys.detail(member.id), member);
    invalidate();
  };
}

/**
 * E17. One `idempotencyKey` per form submit, kept for its retries (BR-REC-156). A refusal that belongs to
 * a field (`serverFieldError`) is shown there by the form; the rest is a short message here.
 */
export function useCreateMember() {
  const refresh = useRefreshMembers();
  return useMutation({
    mutationKey: memberMutationKeys.create(),
    mutationFn: ({ body, idempotencyKey }: { body: CreateMemberBody; idempotencyKey: string }) =>
      createMember(body, idempotencyKey),
    onSuccess: (member) => {
      refresh(member);
      toast.success(`${member.fullName} added.`);
    },
    onError: (err) => {
      if (!serverFieldError(err, 'create')) saveFailed(err, SAVE_FAILED);
    },
  });
}

/** E19: works on archived members too (BR-REC-58). */
export function useUpdateMember(memberId: string) {
  const refresh = useRefreshMembers();
  return useMutation({
    mutationKey: memberMutationKeys.update(memberId),
    mutationFn: (body: UpdateMemberBody) => updateMember(memberId, body),
    onSuccess: (member) => {
      refresh(member);
      toast.success('Saved.');
    },
    onError: (err) => {
      if (!serverFieldError(err, 'update')) saveFailed(err, SAVE_FAILED);
    },
  });
}

/** E20 (BR-REC-06, 58): the confirm sheet is the caller's; the toast says where to find them again. */
export function useArchiveMember(memberId: string) {
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: () => archiveMember(memberId),
    onSuccess: (member) => {
      refresh(member);
      toast.success(`${member.fullName} archived.`);
    },
    onError: (err) => saveFailed(err, SAVE_FAILED),
  });
}

/** E21: the Restore button always works (BR-REC-58). */
export function useRestoreMember(memberId: string) {
  const refresh = useRefreshMembers();
  return useMutation({
    mutationFn: () => restoreMember(memberId),
    onSuccess: (member) => {
      refresh(member);
      toast.success(`${member.fullName} is back on the list.`);
    },
    onError: (err) => saveFailed(err, SAVE_FAILED),
  });
}

/** What the Renew / Edit membership sheet sends: E22 (with its key) or E23 (only the changed fields). */
export type PeriodJob =
  | { kind: 'renew'; body: CreatePeriodBody; idempotencyKey: string }
  | { kind: 'edit'; periodId: string; body: UpdatePeriodBody };

/**
 * E22 / E23 (BR-REC-09, 54, 55, 58). A refusal that belongs to a field (`periodFieldError`: overlap, start
 * before the join date) is shown there by the sheet; the rest is a short message here. When the saved
 * period brings an archived member back (`memberRestored`) the toast says so instead of "renewed".
 * No confirmation (BR-REC-133): the sheet is the only step.
 */
export function useSavePeriod(member: { id: string; fullName: string }) {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationKey: memberMutationKeys.period(member.id),
    mutationFn: (job: PeriodJob) =>
      job.kind === 'renew'
        ? createPeriod(member.id, job.body, job.idempotencyKey)
        : updatePeriod(member.id, job.periodId, job.body),
    onSuccess: (saved, job) => {
      invalidate();
      if (saved.memberRestored) toast.success(`${member.fullName} is back on the list.`);
      else toast.success(job.kind === 'renew' ? `${member.fullName} renewed.` : 'Saved.');
    },
    onError: (err) => {
      if (!periodFieldError(err)) saveFailed(err, SAVE_FAILED);
    },
  });
}
