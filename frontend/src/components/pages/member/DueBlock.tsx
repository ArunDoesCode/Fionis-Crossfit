import Section from '@/components/common/Section';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by due-list (Stream E): this member's assessments with their status (due, soon, assess
// soon, reminder) and the row actions. Replace this whole file.
// Placeholder: the section as grey rows, no data calls.
export default function DueBlock(_props: MemberSlotProps) {
  return <Section title={UI_TEXT.sections.assessments} isLoading />;
}
