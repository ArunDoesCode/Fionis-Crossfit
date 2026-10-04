import { getMe } from '@/lib/api/auth/fetchers';
import { api } from '@/lib/api/client';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import { clientEnv } from '@/lib/env';
import type { ProgressStatsQuery } from '@/lib/progress/filters';
import type { operations } from '@/types/api.generated';

// E35–E39 (contract.md). Success is `{ success: true, data }`; the fetchers hand back `data`. Failures throw
// ApiError. Types come from the generated contract.
type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Reply<Name extends keyof operations, Status extends number> = operations[Name] extends {
  responses: Record<Status, infer R>;
}
  ? Json<R>
  : never;

export type ReportCard = Reply<'getApiMembersMemberIdReport-card', 200>['data'];
export type ReportType = ReportCard['types'][number];
export type ReportMetric = ReportType['metrics'][number];
export type Segmental = NonNullable<ReportCard['segmental']>;
export type ProgressStats = Reply<'getApiReportsProgress', 200>['data'];
export type LeaderboardPage = Reply<'getApiReportsLeaderboard', 200>;
export type LeaderboardItem = LeaderboardPage['data'][number];
export type ActiveByPlan = Reply<'getApiReportsActive-by-plan', 200>['data'];
export type LeaderboardSex = NonNullable<
  operations['getApiReportsLeaderboard']['parameters']['query']
>['sex'];
export type ExportFile = 'members.csv' | 'memberships.csv' | 'measurements.csv';

/** E35: the whole report card of one member. 404 for an unknown member. */
export async function getReportCard(memberId: string, signal?: AbortSignal): Promise<ReportCard> {
  const res = await api.get<Reply<'getApiMembersMemberIdReport-card', 200>>(
    apiPath(API_ROUTES.MEMBERS.REPORT_CARD, { memberId }),
    { signal },
  );
  return res.data;
}

/** E36: the filters that are not set are not sent. */
export async function getProgressStats(
  query: ProgressStatsQuery,
  signal?: AbortSignal,
): Promise<ProgressStats> {
  const res = await api.get<Reply<'getApiReportsProgress', 200>>(API_ROUTES.REPORTS.PROGRESS, {
    query,
    signal,
  });
  return res.data;
}

/** E37: one page of the leaderboard; ranks continue across pages. 400 `NO_DIRECTION` for "No direction". */
export function getLeaderboard(
  params: { metricId: string; sex: LeaderboardSex; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<LeaderboardPage> {
  return api.get<Reply<'getApiReportsLeaderboard', 200>>(API_ROUTES.REPORTS.LEADERBOARD, {
    query: params,
    signal,
  });
}

/** E38 */
export async function getActiveByPlan(signal?: AbortSignal): Promise<ActiveByPlan> {
  const res = await api.get<Reply<'getApiReportsActive-by-plan', 200>>(
    API_ROUTES.REPORTS.ACTIVE_BY_PLAN,
    { signal },
  );
  return res.data;
}

/** E39 address of a file, on the app's own address (D-018): `/api/exports/members.csv`. */
export const exportHref = (file: ExportFile): string =>
  `${clientEnv.NEXT_PUBLIC_API_URL}${apiPath(API_ROUTES.EXPORTS.FILE, { file })}`;

/**
 * P10, BR-REC-119: one E05 call first (it refreshes the sign-in when needed, so the browser's own request
 * carries a fresh cookie), then a plain browser download of the E39 address. The body is never read here:
 * the browser streams the file straight to disk and the app stays usable. A failed check throws and no
 * download starts.
 */
export async function downloadExport(file: ExportFile): Promise<void> {
  await getMe();
  const link = document.createElement('a');
  link.href = exportHref(file);
  link.download = ''; // the saved name comes from the API: `<file>-<date>.csv`
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}
