'use client';

import EmptyState from '@/components/common/EmptyState';
import ErrorState from '@/components/common/ErrorState';
import ListRow, { RowList } from '@/components/common/ListRow';
import ResponsiveSheet from '@/components/common/ResponsiveSheet';
import { RowSkeletons } from '@/components/common/Skeletons';
import StatusBadge from '@/components/common/StatusBadge';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import type { MemberDueRow } from '@/lib/assessments/types';
import { memberDueStatus } from '@/lib/due/status';

export interface ChoosableAssessment {
  id: string;
  name: string;
}

interface ChooseAssessmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Surya": the first word of the member's name. */
  firstName: string;
  /** The turned-on assessments in setup order; undefined while loading. */
  assessments: ChoosableAssessment[] | undefined;
  loadFailed: boolean;
  onRetry: () => void;
  /** E32 rows for the status words; undefined while loading or when E32 does not answer (D11). */
  due: MemberDueRow[] | undefined;
  today: string;
  onPick: (typeId: string) => void;
}

// "Record for Surya" · Body composition — Overdue 34 days · Fitness test — Due in 5 days (BR-REC-73). Only
// turned-on assessments are offered (D4); the status words and tone are the member page's own
// (`memberDueStatus`, BR-REC-185, 197) when E32 answers, else none (D11).
export default function ChooseAssessmentSheet({
  open,
  onOpenChange,
  firstName,
  assessments,
  loadFailed,
  onRetry,
  due,
  today,
  onPick,
}: ChooseAssessmentSheetProps) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={ASSESSMENT_TEXT.recordFor(firstName)}
    >
      {loadFailed ? (
        <ErrorState onRetry={onRetry} />
      ) : !assessments ? (
        <RowSkeletons count={3} />
      ) : assessments.length === 0 ? (
        <EmptyState compact title={ASSESSMENT_TEXT.chooseEmpty} />
      ) : (
        <RowList>
          {assessments.map((assessment) => {
            const row = due?.find((candidate) => candidate.typeId === assessment.id);
            const status = row && memberDueStatus(row, today);
            return (
              <ListRow
                key={assessment.id}
                title={assessment.name}
                status={status ? <StatusBadge tone={status.tone}>{status.text}</StatusBadge> : null}
                onClick={() => onPick(assessment.id)}
              />
            );
          })}
        </RowList>
      )}
    </ResponsiveSheet>
  );
}
