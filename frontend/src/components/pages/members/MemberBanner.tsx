import { Alert02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import RestoreMemberButton from '@/components/pages/members/RestoreMemberButton';
import { cn } from '@/lib/utils';

interface MemberBannerProps {
  memberId: string;
  /** The BR-REC-172 line ("Archived 2 Jun 2026 · Membership ended 31 May 2026"). */
  text: string;
  archived: boolean;
}

// BR-REC-172: the first thing on the page of an archived member or one whose membership ended: when,
// in words, with an icon (never colour alone, BR-REC-125), and Restore while archived.
export default function MemberBanner({ memberId, text, archived }: MemberBannerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-4 text-base',
        archived ? 'bg-neutral-soft text-neutral' : 'bg-danger-soft text-danger',
      )}
    >
      <p className="flex items-start gap-2">
        <HugeiconsIcon
          icon={archived ? InformationCircleIcon : Alert02Icon}
          strokeWidth={2}
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0"
        />
        <span>{text}</span>
      </p>
      {archived && <RestoreMemberButton memberId={memberId} />}
    </div>
  );
}
