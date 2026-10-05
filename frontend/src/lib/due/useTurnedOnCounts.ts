'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { assessmentTypesQueryOptions } from '@/lib/api/setup/queries';

/**
 * How many measurements are turned on for each assessment, by assessment id (BR-REC-225: "All 15
 * measurements" when every one of them is due). Reads the cached catalog; empty while it loads, in which
 * case a row simply lists its names.
 */
export function useTurnedOnCounts(): Map<string, number> {
  // The counts only change when the catalog does: 30 s is fresh enough, and rows on a list don't each ask again.
  const { data } = useQuery({ ...assessmentTypesQueryOptions(false), staleTime: 30_000 });
  return useMemo(
    () =>
      new Map((data ?? []).map((type) => [type.id, type.metrics.filter((m) => m.isActive).length])),
    [data],
  );
}
