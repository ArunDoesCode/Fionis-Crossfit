import { api } from '@/lib/api/client';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import type {
  CreateMemberBody,
  MemberDetail,
  MemberListPage,
  MemberListQuery,
  UpdateMemberBody,
} from '@/lib/members/types';

// Success is `{ success: true, data }`; the fetchers hand back `data` (lists: `{ data, meta }`).
// Failures throw ApiError (code + details for the form to show next to a field).

/** E16: one page of members. `q` needs 2+ characters (the API answers 400 below that, BR-REC-07). */
export async function listMembers(query: MemberListQuery): Promise<MemberListPage> {
  return api.get<MemberListPage>(API_ROUTES.MEMBERS.LIST, { query });
}

/** E18: the whole member: details, membership and every period. Archived members too. */
export async function getMember(memberId: string): Promise<MemberDetail> {
  const res = await api.get<{ data: MemberDetail }>(
    apiPath(API_ROUTES.MEMBERS.DETAIL, { memberId }),
  );
  return res.data;
}

/**
 * E17: add a member with the first membership. `idempotencyKey` is made once per form submit and
 * reused when the same submit is retried, so a retry never adds a second member (BR-REC-156).
 */
export async function createMember(
  body: CreateMemberBody,
  idempotencyKey: string,
): Promise<MemberDetail> {
  const res = await api.post<{ data: MemberDetail }, CreateMemberBody>(
    API_ROUTES.MEMBERS.CREATE,
    body,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return res.data;
}

/** E19: change details (archived members too). Only the fields sent change; `null` clears one. */
export async function updateMember(
  memberId: string,
  body: UpdateMemberBody,
): Promise<MemberDetail> {
  const res = await api.patch<{ data: MemberDetail }, UpdateMemberBody>(
    apiPath(API_ROUTES.MEMBERS.UPDATE, { memberId }),
    body,
  );
  return res.data;
}

/** E20: hide the member from search and Home (BR-REC-06). Already archived → unchanged. */
export async function archiveMember(memberId: string): Promise<MemberDetail> {
  const res = await api.post<{ data: MemberDetail }>(
    apiPath(API_ROUTES.MEMBERS.ARCHIVE, { memberId }),
  );
  return res.data;
}

/** E21: bring an archived member back. Not archived → unchanged. */
export async function restoreMember(memberId: string): Promise<MemberDetail> {
  const res = await api.post<{ data: MemberDetail }>(
    apiPath(API_ROUTES.MEMBERS.RESTORE, { memberId }),
  );
  return res.data;
}
