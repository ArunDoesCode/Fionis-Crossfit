import LinkButton from '@/components/common/LinkButton';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import DueBlock from '@/components/pages/member/DueBlock';
import MemberHeader from '@/components/pages/member/MemberHeader';
import MembershipBlock from '@/components/pages/member/MembershipBlock';
import RecentBlock from '@/components/pages/member/RecentBlock';
import { UI_TEXT } from '@/lib/messages/words';

interface MemberViewProps {
  memberId: string;
}

// FRAME of the Member page (S7, `/admin/members/[memberId]`), owned by Stream 0. Phone order (members
// sub-spec): person, membership, assessments, recent, the two link buttons, then the one main action
// "Record assessment" in the bar above the tabs. From 1024 px: person + membership left, assessments +
// recent right, inside the 720 px detail width (BR-REC-139) and the main action in the header.
// The four blocks are slots (see the imports); the frame has no data calls. The page title is the word
// "Member": the person's name belongs to MemberHeader.
export default function MemberView({ memberId }: MemberViewProps) {
  const base = `/admin/members/${memberId}` as const;

  return (
    <Page width="narrow">
      <PageHeader
        title={UI_TEXT.screens.member}
        backHref="/admin/members"
        secondary={
          <LinkButton href={`${base}/edit`} variant="ghost" size="default">
            {UI_TEXT.screens.edit}
          </LinkButton>
        }
        action={<LinkButton href={`${base}/assess`}>{UI_TEXT.screens.recordAssessment}</LinkButton>}
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
        <LinkButton href={`${base}/assessments`} variant="secondary">
          {UI_TEXT.screens.allAssessments}
        </LinkButton>
        <LinkButton href={`${base}/report`} variant="secondary">
          {UI_TEXT.screens.reportCard}
        </LinkButton>
      </div>
    </Page>
  );
}
