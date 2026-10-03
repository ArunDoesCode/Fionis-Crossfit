import Section from '@/components/common/Section';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by due-list (Stream E): "Overdue" then "Due soon", each with count, first 5 rows and
// "See all" (BR-REC-101). The frame (HomeView) only places this; replace this whole file.
// Placeholder: the two sections as grey rows, no data calls.
export default function DueSections() {
  return (
    <>
      <Section title={UI_TEXT.sections.overdue} isLoading />
      <Section title={UI_TEXT.sections.dueSoon} isLoading />
    </>
  );
}
