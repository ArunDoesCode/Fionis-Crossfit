import { api } from '@/lib/api/client';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import type {
  DueActionBody,
  DueActionResult,
  DueListPage,
  DueListStatus,
  MemberDueItem,
} from '@/lib/due/types';

// E31–E34 (api-contract.md, due-list.md). Success is `{ success: true, data }`; the fetchers hand back `data` (E31: the
// `{ data, meta }` envelope, the count of a Home section is `meta.total`). Failures throw ApiError with the
// server's `code`. Writes carry no `Idempotency-Key` (BR-REC-156 covers E17 and E22 only): E33 and E34 are
// idempotent by nature.

export interface DueListQuery {
  status: DueListStatus;
  /** One assessment only (BR-REC-104); left out for "All". */
  typeId?: string | null;
  page: number;
  pageSize: number;
}

/** E31: one page of the Overdue (`status: 'overdue'`) or Due soon (`'upcoming'`) list. `signal` cancels a stale read. */
export async function fetchDueList(
  query: DueListQuery,
  signal?: AbortSignal,
): Promise<DueListPage> {
  const { typeId, ...rest } = query;
  return api.get<DueListPage>(API_ROUTES.DUE.LIST, {
    query: { ...rest, typeId: typeId ?? undefined },
    signal,
  });
}

/** E32: one line per turned-on assessment of the member (archived members too), in setup order. */
export async function fetchMemberDue(
  memberId: string,
  signal?: AbortSignal,
): Promise<MemberDueItem[]> {
  const res = await api.get<{ data: MemberDueItem[] }>(
    apiPath(API_ROUTES.MEMBERS.DUE, { memberId }),
    { signal },
  );
  return res.data;
}

/** E33: Assess soon (`{ action: 'flag' }`) or Remind me later (`{ action: 'snooze', until }`); replaces the other. */
export async function putDueAction(
  memberId: string,
  typeId: string,
  body: DueActionBody,
): Promise<DueActionResult> {
  const res = await api.put<{ data: DueActionResult }, DueActionBody>(
    apiPath(API_ROUTES.MEMBERS.DUE_ACTION, { memberId, typeId }),
    body,
  );
  return res.data;
}

/** E34: remove Assess soon or the reminder; with nothing set it still answers `{}`. */
export async function deleteDueAction(
  memberId: string,
  typeId: string,
): Promise<Record<string, never>> {
  const res = await api.delete<{ data: Record<string, never> }>(
    apiPath(API_ROUTES.MEMBERS.DUE_ACTION, { memberId, typeId }),
  );
  return res.data;
}
