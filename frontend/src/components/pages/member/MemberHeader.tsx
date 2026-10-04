'use client';

import { Call02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import ErrorState from '@/components/common/ErrorState';
import type { MemberSlotProps } from '@/components/pages/member/slotProps';
import ArchiveMemberButton from '@/components/pages/members/ArchiveMemberButton';
import MemberBanner from '@/components/pages/members/MemberBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/errors';
import { useMember } from '@/lib/api/members/queries';
import { formatDay, formatPhone } from '@/lib/format';
import { memberBannerText } from '@/lib/members/banner';
import { SEX_LABELS } from '@/lib/members/labels';
import { deviceTimeZone, useToday } from '@/lib/members/useToday';
import { messageForCode } from '@/lib/messages/errors';

// SLOT owned by members (Stream B), S7: the archived/ended banner (BR-REC-172), then name, "44 y · Male ·
// Joined 1 Jun 2025", the phone to tap and call, and Archive (BR-REC-06, 58, 59). Edit is in the page header
// (the frame's). Grey shapes while loading, "Couldn't load this." in its own place when it fails
// (BR-REC-129, 131): the other blocks keep working.
export default function MemberHeader({ memberId }: MemberSlotProps) {
  const { data: member, error, isError, refetch } = useMember(memberId);
  const today = useToday();

  if (!member) {
    if (!isError) {
      return (
        <div aria-busy="true" className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
          <Skeleton className="h-5 w-40 max-w-full" />
        </div>
      );
    }
    const missing = isApiError(error) && error.status === 404;
    return (
      <ErrorState
        message={missing ? messageForCode('NOT_FOUND') : undefined}
        onRetry={missing ? undefined : () => void refetch()}
      />
    );
  }

  const banner = memberBannerText(member, today, deviceTimeZone());
  const archived = member.archivedAt !== null;

  return (
    <div className="flex flex-col gap-4">
      {banner && <MemberBanner memberId={member.id} text={banner} archived={archived} />}
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-2xl font-semibold lg:text-3xl">{member.fullName}</h2>
        <p className="text-base text-muted-foreground">
          {`${member.age} y · ${SEX_LABELS[member.sex]} · Joined ${formatDay(member.joinedOn, today)}`}
        </p>
        <a
          href={`tel:${member.phone}`}
          className="inline-flex min-h-11 w-fit items-center gap-2 text-base font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <HugeiconsIcon icon={Call02Icon} strokeWidth={2} aria-hidden="true" className="size-5" />
          {formatPhone(member.phone)}
          <span className="sr-only"> (call)</span>
        </a>
      </div>
      {!archived && <ArchiveMemberButton memberId={member.id} fullName={member.fullName} />}
    </div>
  );
}
