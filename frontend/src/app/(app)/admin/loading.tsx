import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import { Skeleton } from '@/components/ui/skeleton';
import { DEFAULT_GYM_NAME, UI_TEXT } from '@/lib/messages/words';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="wide">
      <PageHeader title={DEFAULT_GYM_NAME} />
      <Skeleton className="h-12 w-full rounded-4xl" />
      <div className="section-gap grid grid-cols-1 lg:grid-cols-2 lg:items-start">
        <div className="section-gap flex flex-col">
          <Section title={UI_TEXT.sections.overdue} isLoading />
          <Section title={UI_TEXT.sections.dueSoon} isLoading />
        </div>
        <div className="section-gap flex flex-col">
          <Section title={UI_TEXT.sections.membershipsEnding} isLoading />
          <Section title={UI_TEXT.sections.recentlyEnded} isLoading />
        </div>
      </div>
    </Page>
  );
}
