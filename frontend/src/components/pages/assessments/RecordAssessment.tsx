'use client';

import { useQueryStates } from 'nuqs';
import ChooseGate from '@/components/pages/assessments/ChooseGate';
import EntryScreen from '@/components/pages/assessments/EntryScreen';
import { dateFromParam, entryParams, typeFromParam } from '@/lib/assessments/entryParams';
import { useToday } from '@/lib/members/useToday';

interface RecordAssessmentProps {
  memberId: string;
}

// S10 `/admin/members/[memberId]/assess?type=&date=`: with an assessment in the address the form, without
// one the choose-assessment sheet (BR-REC-73). Drawn in the browser only (see the View): the date defaults
// to the device's day. The form is re-keyed when the member or the assessment changes.
export default function RecordAssessment({ memberId }: RecordAssessmentProps) {
  const [{ type, date }, setParams] = useQueryStates(entryParams);
  const today = useToday();
  const typeId = typeFromParam(type);

  if (typeId === null) {
    return (
      <ChooseGate
        memberId={memberId}
        today={today}
        onPick={(picked) => void setParams({ type: picked })}
      />
    );
  }
  return (
    <EntryScreen
      key={`${memberId}:${typeId}`}
      memberId={memberId}
      typeId={typeId}
      initialDate={dateFromParam(date, today)}
      today={today}
    />
  );
}
