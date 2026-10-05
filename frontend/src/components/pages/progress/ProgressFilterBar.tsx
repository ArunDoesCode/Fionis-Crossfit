'use client';

import MonthPicker from '@/components/common/MonthPicker';
import { FILTER_FIRST, FILTER_GRID } from '@/components/pages/progress/ProgressSkeleton';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AssessmentType } from '@/lib/api/setup/fetchers';
import { SEX_LABELS } from '@/lib/members/labels';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { useToday } from '@/lib/members/useToday';
import {
  AGE_BANDS,
  type AgeBand,
  PLANS,
  type Plan,
  type ProgressFilters,
  SEXES,
  type Sex,
} from '@/lib/progress/filters';
import { AGE_BAND_LABELS, PROGRESS_TEXT } from '@/lib/progress/text';
import { cn } from '@/lib/utils';

const text = PROGRESS_TEXT.progress;
const ANY = 'any';

interface Option {
  value: string;
  label: string;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string | null;
  /** One group without a label for a plain list; the measurement list has one group per assessment. */
  groups: { label?: string; options: Option[] }[];
  /** The text shown for a value that is not in the list: a measurement that was turned off, or none yet. */
  fallbackLabel: string;
  onChange: (value: string) => void;
  className?: string;
}

function FilterSelect({
  id,
  label,
  value,
  groups,
  fallbackLabel,
  onChange,
  className,
}: FilterSelectProps) {
  const labelFor = (current: string | null): string =>
    groups.flatMap((group) => group.options).find((option) => option.value === current)?.label ??
    fallbackLabel;

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(next) => next !== null && onChange(String(next))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue>{(current: string | null) => labelFor(current)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.label ?? 'all'}>
              {group.label && <SelectLabel>{group.label}</SelectLabel>}
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const anyOr = <T extends string>(
  any: string,
  codes: readonly T[],
  labels: Record<T, string>,
): Option[] => [
  { value: ANY, label: any },
  ...codes.map((code) => ({ value: code, label: labels[code] })),
];

interface ProgressFilterBarProps {
  catalog: AssessmentType[];
  /** The measurement asked for: the address's, or the default (P11). */
  metricId: string | null;
  filters: ProgressFilters;
  onChange: (patch: Partial<ProgressFilters>) => void;
}

// S13 controls (BR-REC-111, P11): the measurement (only those that are on, grouped by assessment), the join
// months, plan, sex and age band. Phone: stacked, two to a line where short; from 1280 px one row.
// Every change goes to the address through `onChange`, so the view can be bookmarked.
export default function ProgressFilterBar({
  catalog,
  metricId,
  filters,
  onChange,
}: ProgressFilterBarProps) {
  const today = useToday();
  const groups = catalog
    .filter((type) => type.isActive)
    .map((type) => ({
      label: type.name,
      options: type.metrics
        .filter((metric) => metric.isActive)
        .map((metric) => ({ value: metric.id, label: metric.name })),
    }))
    .filter((group) => group.options.length > 0);

  // A bookmarked measurement that has since been turned off still answers (E36), so it stays chosen.
  const chosen = catalog.flatMap((type) => type.metrics).find((metric) => metric.id === metricId);
  const fallbackLabel = chosen ? `${chosen.name} (${text.turnedOff})` : text.pickMeasurement;

  return (
    <div className={FILTER_GRID}>
      <FilterSelect
        id="progress-measurement"
        label={text.measurement}
        value={metricId}
        groups={groups}
        fallbackLabel={fallbackLabel}
        onChange={(value) => onChange({ metricId: value })}
        className={FILTER_FIRST}
      />
      <MonthPicker
        id="progress-joined-from"
        label={text.joinedFrom}
        value={filters.joinedFrom ?? ''}
        today={today}
        onChange={(value) => onChange({ joinedFrom: value || undefined })}
      />
      <MonthPicker
        id="progress-joined-to"
        label={text.joinedTo}
        value={filters.joinedTo ?? ''}
        today={today}
        min={filters.joinedFrom}
        onChange={(value) => onChange({ joinedTo: value || undefined })}
      />
      <FilterSelect
        id="progress-plan"
        label={text.plan}
        value={filters.plan ?? ANY}
        groups={[{ options: anyOr(text.anyPlan, PLANS, PLAN_LABELS) }]}
        fallbackLabel={text.anyPlan}
        onChange={(value) => onChange({ plan: value === ANY ? undefined : (value as Plan) })}
        className="col-span-2 sm:col-span-1"
      />
      <FilterSelect
        id="progress-sex"
        label={text.sex}
        value={filters.sex ?? ANY}
        groups={[{ options: anyOr(text.anySex, SEXES, SEX_LABELS) }]}
        fallbackLabel={text.anySex}
        onChange={(value) => onChange({ sex: value === ANY ? undefined : (value as Sex) })}
      />
      <FilterSelect
        id="progress-age"
        label={text.age}
        value={filters.ageBand ?? ANY}
        groups={[{ options: anyOr(text.anyAge, AGE_BANDS, AGE_BAND_LABELS) }]}
        fallbackLabel={text.anyAge}
        onChange={(value) => onChange({ ageBand: value === ANY ? undefined : (value as AgeBand) })}
      />
    </div>
  );
}
