import Section from '@/components/common/Section';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by members (Stream B): "Memberships ending" then "Recently ended" (BR-REC-101, 53).
// The frame (HomeView) only places this; replace this whole file.
// Placeholder: the two sections as grey rows, no data calls.
export default function MembershipSections() {
  return (
    <>
      <Section title={UI_TEXT.sections.membershipsEnding} isLoading />
      <Section title={UI_TEXT.sections.recentlyEnded} isLoading />
    </>
  );
}
