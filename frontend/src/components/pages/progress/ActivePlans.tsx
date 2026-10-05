'use client';

import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import { useActiveByPlan } from '@/lib/api/progress/queries';
import { PLAN_LABELS } from '@/lib/members/membershipText';
import { PLANS, type Plan } from '@/lib/progress/filters';
import { PROGRESS_TEXT } from '@/lib/progress/text';

const text = PROGRESS_TEXT.progress;

// E38 answers `halfAnnual`; the plan code is `half_annual`.
const COUNT_KEY = {
  monthly: 'monthly',
  quarterly: 'quarterly',
  half_annual: 'halfAnnual',
  annual: 'annual',
} as const satisfies Record<Plan, string>;

// BR-REC-116: members whose membership is Active or Ends soon, by plan, and the total. Own loading and
// error state, so the rest of S13 keeps working when this fails (BR-REC-131).
export default function ActivePlans() {
  const active = useActiveByPlan();
  const data = active.data;

  return (
    <Section
      title={text.activeByPlan}
      isLoading={!data && !active.isError}
      loadingFallback={<CardSkeleton className="h-61" />}
      isError={!data && active.isError}
      onRetry={() => void active.refetch()}
    >
      {data && (
        <dl className="divide-y overflow-hidden rounded-2xl border bg-card">
          {PLANS.map((plan) => (
            <div key={plan} className="flex min-h-12 items-center justify-between gap-3 px-4">
              <dt className="text-base">{PLAN_LABELS[plan]}</dt>
              <dd className="tabular-nums text-base">{data[COUNT_KEY[plan]]}</dd>
            </div>
          ))}
          <div className="flex min-h-12 items-center justify-between gap-3 px-4 font-semibold">
            <dt className="text-base">{text.total}</dt>
            <dd className="tabular-nums text-base">{data.total}</dd>
          </div>
        </dl>
      )}
    </Section>
  );
}
