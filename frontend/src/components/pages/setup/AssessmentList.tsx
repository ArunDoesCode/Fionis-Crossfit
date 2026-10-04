'use client';

import ListRow, { RowList } from '@/components/common/ListRow';
import StatusBadge from '@/components/common/StatusBadge';
import MoveButtons from '@/components/pages/setup/MoveButtons';
import type { AssessmentType } from '@/lib/api/setup/fetchers';
import { intervalLabel } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';

interface AssessmentListProps {
  assessments: readonly AssessmentType[];
  onMove: (index: number, direction: 'up' | 'down') => void;
}

// S15 list (BR-REC-13, 66, 67): one row per assessment, on and off, in setup order. The row opens the
// assessment's measurements; an Off badge says it is turned off (words, not colour alone: BR-REC-125).
export default function AssessmentList({ assessments, onMove }: AssessmentListProps) {
  return (
    <RowList>
      {assessments.map((assessment, index) => (
        <ListRow
          key={assessment.id}
          title={assessment.name}
          detail={intervalLabel(assessment.intervalCount, assessment.intervalUnit)}
          href={`/admin/settings/assessments/${assessment.id}`}
          status={
            assessment.isActive ? undefined : (
              <StatusBadge tone="neutral">{SETUP_TEXT.assessments.off}</StatusBadge>
            )
          }
          trailing={
            <MoveButtons
              name={assessment.name}
              canMoveUp={index > 0}
              canMoveDown={index < assessments.length - 1}
              onMove={(direction) => onMove(index, direction)}
            />
          }
        />
      ))}
    </RowList>
  );
}
