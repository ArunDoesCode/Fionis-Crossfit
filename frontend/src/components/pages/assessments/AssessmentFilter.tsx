'use client';

import ChoiceChips from '@/components/common/ChoiceChips';
import ErrorState from '@/components/common/ErrorState';
import { FilterSkeleton } from '@/components/pages/assessments/AllAssessmentsSkeleton';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';

const ALL = 'all';

interface AssessmentFilterProps {
  /** The assessments to offer, in setup order; undefined while loading. */
  assessments: { id: string; name: string }[] | undefined;
  loadFailed: boolean;
  onRetry: () => void;
  /** The chosen assessment, or `null` for All. */
  typeId: string | null;
  onChange: (typeId: string | null) => void;
}

// S11 filter (BR-REC-89): All + one chip per assessment. It lives in the address (`?type=`), so Back from an
// assessment returns to the same list. Its own loading and error state; the rows below work without it.
export default function AssessmentFilter({
  assessments,
  loadFailed,
  onRetry,
  typeId,
  onChange,
}: AssessmentFilterProps) {
  if (loadFailed) return <ErrorState onRetry={onRetry} />;
  if (!assessments) return <FilterSkeleton />;

  const options = [
    { value: ALL, label: ASSESSMENT_TEXT.filterAll },
    ...assessments.map(({ id, name }) => ({ value: id, label: name })),
  ];
  return (
    <ChoiceChips
      legend={ASSESSMENT_TEXT.filterLegend}
      hideLegend
      options={options}
      value={typeId ?? ALL}
      onChange={(value) => onChange(value === ALL ? null : value)}
    />
  );
}
