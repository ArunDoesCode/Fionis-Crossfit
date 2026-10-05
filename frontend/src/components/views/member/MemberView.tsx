'use client';

import { ChartLineData01Icon, ListViewIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Link from 'next/link';
import EmptyState from '@/components/common/EmptyState';
import MemberAvatar from '@/components/common/MemberAvatar';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import {
  DueBlock,
  MemberBanner,
  MemberMeta,
  MemberMoreMenu,
  MembershipBlock,
  RecentBlock,
} from '@/components/pages/member/MemberBlocks';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/errors';
import { useMember } from '@/lib/api/members/queries';
import { MEMBER_PAGE_TEXT } from '@/lib/members/pageText';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberViewProps {
  memberId: string;
}

// Member page (S7, `/admin/members/[memberId]`, BR-REC-224). The page title is the member's name (breadcrumb
// parents stay "Members"), with the meta line under it (status, plan, phone, joined date), "Edit" and the
// one main action "Record assessment" in the header, and "⋯" (Archive) beside them. Under the header at most
// one banner (archived, or the next step), then the two outline buttons, then the blocks: person-side
// Membership on the left, Assessments + Recent on the right from 1024 px. Each block has its own loading and
// error state (BR-REC-129, 131). An unknown member shows only the one message and [Back to members].
export default function MemberView({ memberId }: MemberViewProps) {
  const { data: member, error } = useMember(memberId);
  const base = `/admin/members/${memberId}` as const;

  // A malformed id is the same as an unknown member (the report card does the same).
  if (isApiError(error) && (error.status === 404 || error.status === 400)) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          title={MEMBER_PAGE_TEXT.notFound}
          action={
            <Button size="lg" nativeButton={false} render={<Link href="/admin/members" />}>
              {MEMBER_PAGE_TEXT.backToMembers}
            </Button>
          }
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title={member?.fullName}
        leading={
          member && (
            <MemberAvatar
              name={member.fullName}
              size="lg"
              className="max-md:size-10 max-md:text-sm"
            />
          )
        }
        meta={<MemberMeta memberId={memberId} />}
        secondary={
          <>
            <Button
              variant="ghost"
              size="default"
              nativeButton={false}
              render={<Link href={`${base}/edit`} />}
            >
              {UI_TEXT.screens.edit}
            </Button>
            {member && !member.archivedAt && (
              <MemberMoreMenu memberId={memberId} fullName={member.fullName} />
            )}
          </>
        }
        action={
          <Button size="lg" nativeButton={false} render={<Link href={`${base}/assess`} />}>
            {UI_TEXT.screens.recordAssessment}
          </Button>
        }
      />
      <MemberBanner memberId={memberId} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<Link href={`${base}/report`} />}
        >
          <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} aria-hidden="true" />
          {UI_TEXT.screens.reportCard}
        </Button>
        <Button
          variant="outline"
          size="lg"
          nativeButton={false}
          render={<Link href={`${base}/assessments`} />}
        >
          <HugeiconsIcon icon={ListViewIcon} strokeWidth={2} aria-hidden="true" />
          {UI_TEXT.screens.allAssessments}
        </Button>
      </div>
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <MembershipBlock memberId={memberId} />
        <div className="section-gap flex flex-col">
          <DueBlock memberId={memberId} />
          <RecentBlock memberId={memberId} />
        </div>
      </div>
    </Page>
  );
}
