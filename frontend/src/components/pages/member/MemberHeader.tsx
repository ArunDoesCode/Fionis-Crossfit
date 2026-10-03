import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import { Skeleton } from '@/components/ui/skeleton';

// SLOT owned by members (Stream B): the archived/ended banner (BR-REC-172, FIXED_LINES.archivedEndedBanner),
// then name, age, sex, join date and phone to tap-to-call (BR-REC-59). Replace this whole file.
// Placeholder: grey shapes at the real size (name 28 px, two detail lines), no data calls.
export default function MemberHeader(_props: MemberSlotProps) {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <Skeleton className="h-8 w-56 max-w-full" />
      <Skeleton className="h-5 w-64 max-w-full" />
      <Skeleton className="h-5 w-40 max-w-full" />
    </div>
  );
}
