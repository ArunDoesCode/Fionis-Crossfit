import type { Route } from 'next';
import ListRow from '@/components/common/ListRow';
import { assessmentDateLabel, resultCountLabel } from '@/lib/assessments/labels';
import type { AssessmentListItem } from '@/lib/assessments/types';

type AssessmentRowProps = {
  item: AssessmentListItem;
  today: string;
} & ({ href: Route } | { onClick: () => void });

// One saved assessment as a list row (BR-REC-80, 89; D18): the date ("12 Sep 2026", or "≈ Dec 2025" when it
// is an estimate), the assessment's name, and "15 results" at the right. S11 opens the sheet on tap; the
// member page's Recent block links to S11 with the assessment already open.
export default function AssessmentRow(props: AssessmentRowProps) {
  const { item, today } = props;
  const row = {
    title: assessmentDateLabel(item.date, item.isEstimated, today),
    detail: item.typeName,
    status: (
      <span className="text-sm text-muted-foreground">{resultCountLabel(item.valueCount)}</span>
    ),
  };
  return 'href' in props ? (
    <ListRow {...row} href={props.href} />
  ) : (
    <ListRow {...row} onClick={props.onClick} />
  );
}
