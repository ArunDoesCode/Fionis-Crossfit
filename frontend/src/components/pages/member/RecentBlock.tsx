import Section from '@/components/common/Section';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by assessments (Stream D): the latest assessments and "All assessments" (S11).
// Replace this whole file.
// Placeholder: the section as grey rows, no data calls.
export default function RecentBlock(_props: MemberSlotProps) {
  return <Section title={UI_TEXT.sections.recent} isLoading />;
}
