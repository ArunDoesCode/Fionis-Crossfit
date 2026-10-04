import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api/errors';
import { messageForCode } from '@/lib/messages/errors';
import type { ProgressStatsQuery } from '@/lib/progress/filters';
import {
  downloadExport,
  type ExportFile,
  getActiveByPlan,
  getLeaderboard,
  getProgressStats,
  getReportCard,
  type LeaderboardSex,
} from './fetchers';

/** BR-REC-115: the leaderboard is the top 10; "Show more" asks for the next 10. */
export const LEADERBOARD_PAGE_SIZE = 10;

export const progressKeys = {
  all: ['progress'] as const,
  reportCard: (memberId: string) => [...progressKeys.all, 'report-card', memberId] as const,
  stats: (query: ProgressStatsQuery) => [...progressKeys.all, 'stats', query] as const,
  leaderboard: (metricId: string, sex: LeaderboardSex) =>
    [...progressKeys.all, 'leaderboard', metricId, sex] as const,
  activeByPlan: () => [...progressKeys.all, 'active-by-plan'] as const,
};

// BR-REC-110, P1: nothing here is ever fresh. The server computes every answer live, so every open asks
// again (the app default of 30 s would show a number from before the last save).
export const reportCardQueryOptions = (memberId: string) =>
  queryOptions({
    queryKey: progressKeys.reportCard(memberId),
    queryFn: ({ signal }) => getReportCard(memberId, signal),
    staleTime: 0,
  });

export const progressStatsQueryOptions = (query: ProgressStatsQuery) =>
  queryOptions({
    queryKey: progressKeys.stats(query),
    queryFn: ({ signal }) => getProgressStats(query, signal),
    staleTime: 0,
  });

export const activeByPlanQueryOptions = () =>
  queryOptions({
    queryKey: progressKeys.activeByPlan(),
    queryFn: ({ signal }) => getActiveByPlan(signal),
    staleTime: 0,
  });

export const leaderboardInfiniteQueryOptions = (metricId: string, sex: LeaderboardSex) =>
  infiniteQueryOptions({
    queryKey: progressKeys.leaderboard(metricId, sex),
    queryFn: ({ pageParam, signal }) =>
      getLeaderboard({ metricId, sex, page: pageParam, pageSize: LEADERBOARD_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: ({ meta }) => (meta.page < meta.totalPages ? meta.page + 1 : undefined),
    staleTime: 0,
  });

/** E35 (S12). */
export const useReportCard = (memberId: string) => useQuery(reportCardQueryOptions(memberId));

const NO_QUERY: ProgressStatsQuery = { metricId: '' };

/**
 * E36 (S13). `null` until a measurement is known. While a filter changes the old numbers stay on screen
 * (`isPlaceholderData`) instead of flashing grey shapes at every tap.
 */
export const useProgressStats = (query: ProgressStatsQuery | null) =>
  useQuery({
    ...progressStatsQueryOptions(query ?? NO_QUERY),
    enabled: query !== null,
    placeholderData: keepPreviousData,
  });

/** E37 (S13): one sex at a time; `enabled` is false for "No direction" (the API answers 400). */
export const useLeaderboard = (metricId: string | null, sex: LeaderboardSex, enabled: boolean) =>
  useInfiniteQuery({
    ...leaderboardInfiniteQueryOptions(metricId ?? '', sex),
    enabled: enabled && metricId !== null,
  });

/** E38 (S13). */
export const useActiveByPlan = () => useQuery(activeByPlanQueryOptions());

/** S18: one download. A 401 is the global handler's (it opens Login); any other failure is a toast. */
export function useDownloadExport() {
  return useMutation({
    mutationFn: (file: ExportFile) => downloadExport(file),
    onError: (err) => {
      if (isApiError(err) && err.status === 401) return;
      toast.error(messageForCode(isApiError(err) ? err.code : undefined));
    },
  });
}
