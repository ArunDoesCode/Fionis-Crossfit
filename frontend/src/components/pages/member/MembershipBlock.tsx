import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { UI_TEXT } from '@/lib/messages/words';

// SLOT owned by members (Stream B): plan, status, days left, end date and the Renew button; the
// Renew / edit-membership sheet (S9) opens from here. Replace this whole file.
// Placeholder: the section with a card-sized grey shape, no data calls.
export default function MembershipBlock(_props: MemberSlotProps) {
  return (
    <Section
      title={UI_TEXT.sections.membership}
      isLoading
      loadingFallback={<CardSkeleton className="h-28" />}
    />
  );
}
