import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page>
      <PageHeader
        pattern="/admin/members/[memberId]"
        meta={<Skeleton aria-hidden="true" className="mt-1 h-5 w-72 max-w-full" />}
      />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-36 rounded-4xl" />
        <Skeleton className="h-10 w-44 rounded-4xl" />
      </div>
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <Section
          title={UI_TEXT.sections.membership}
          isLoading
          loadingFallback={<CardSkeleton className="h-28" />}
        />
        <div className="section-gap flex flex-col">
          <Section title={UI_TEXT.sections.assessments} isLoading />
          <Section title={UI_TEXT.sections.recent} isLoading />
        </div>
      </div>
    </Page>
  );
}
