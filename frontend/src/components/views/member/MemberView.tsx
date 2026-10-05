import Link from 'next/link';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import {
  DueBlock,
  MemberHeader,
  MembershipBlock,
  RecentBlock,
} from '@/components/pages/member/MemberBlocks';
import { Button } from '@/components/ui/button';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberViewProps {
  memberId: string;
}

// FRAME of the Member page (S7, `/admin/members/[memberId]`), owned by Stream 0. Phone order (members
// sub-spec): person, membership, assessments, recent, the two link buttons, then the one main action
// "Record assessment" in the bar above the tabs. From 1024 px: person + membership left, assessments +
// recent right, inside the 720 px detail width (BR-REC-139) and the main action in the header.
// The four blocks live in pages/member/MemberBlocks; the frame has no data calls. The page title is the word
// "Member": the person's name belongs to MemberHeader.
export default function MemberView({ memberId }: MemberViewProps) {
  const base = `/admin/members/${memberId}` as const;

  return (
    <Page>
      <PageHeader
        secondary={
          <Button
            variant="ghost"
            size="default"
            nativeButton={false}
            render={<Link href={`${base}/edit`} />}
          >
            {UI_TEXT.screens.edit}
          </Button>
        }
        action={
          <Button size="lg" nativeButton={false} render={<Link href={`${base}/assess`} />}>
            {UI_TEXT.screens.recordAssessment}
          </Button>
        }
      />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <div className="section-gap flex flex-col">
          <MemberHeader memberId={memberId} />
          <MembershipBlock memberId={memberId} />
        </div>
        <div className="section-gap flex flex-col">
          <DueBlock memberId={memberId} />
          <RecentBlock memberId={memberId} />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row *:flex-1">
        <Button
          variant="secondary"
          size="lg"
          nativeButton={false}
          render={<Link href={`${base}/assessments`} />}
        >
          {UI_TEXT.screens.allAssessments}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          nativeButton={false}
          render={<Link href={`${base}/report`} />}
        >
          {UI_TEXT.screens.reportCard}
        </Button>
      </div>
    </Page>
  );
}
