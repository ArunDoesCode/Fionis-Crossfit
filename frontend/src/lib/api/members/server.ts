import 'server-only';
import { cache } from 'react';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import { serverApi } from '@/lib/api/server';
import type { MemberDetail } from '@/lib/members/types';

/**
 * E18 on the server, read once per request (BR-REC-213): the page title (`generateMetadata`) and the page's
 * prefetch share this one call, so a cold member page asks the API for the member once. Throws like the
 * client fetcher does; the callers decide what a failure means.
 */
export const getMemberOnServer = cache(async (memberId: string): Promise<MemberDetail> => {
  const res = await serverApi.get<{ data: MemberDetail }>(
    apiPath(API_ROUTES.MEMBERS.DETAIL, { memberId }),
    { timeoutMs: 3_000 },
  );
  return res.data;
});
