import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import { CardSkeleton } from '@/components/common/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="narrow">
      <PageHeader />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <div className="section-gap flex flex-col">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-5 w-64 max-w-full" />
            <Skeleton className="h-5 w-40 max-w-full" />
          </div>
          <Section
            title={UI_TEXT.sections.membership}
            isLoading
            loadingFallback={<CardSkeleton className="h-28" />}
          />
        </div>
        <div className="section-gap flex flex-col">
          <Section title={UI_TEXT.sections.assessments} isLoading />
          <Section title={UI_TEXT.sections.recent} isLoading />
        </div>
      </div>
    </Page>
  );
}
