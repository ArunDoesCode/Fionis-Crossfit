'use client';

import { useMemo } from 'react';
import { useAssessmentTypes } from '@/lib/api/setup/queries';

/**
 * How many measurements are turned on for each assessment, by assessment id (BR-REC-225: "All 15
 * measurements" when every one of them is due). Reads the cached catalog; empty while it loads, in which
 * case a row simply lists its names.
 */
export function useTurnedOnCounts(): Map<string, number> {
  const { data } = useAssessmentTypes(false);
  return useMemo(
    () =>
      new Map((data ?? []).map((type) => [type.id, type.metrics.filter((m) => m.isActive).length])),
    [data],
  );
}
