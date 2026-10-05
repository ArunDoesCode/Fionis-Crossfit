import EmptyState from '@/components/common/EmptyState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { UI_TEXT } from '@/lib/messages/words';

interface PlaceholderScreenProps {
  title: string;
  width?: 'narrow' | 'wide';
}

// Stands in for a screen its stream has not built yet, so tabs and buttons already lead somewhere.
// The owning stream replaces the route's page.tsx and this file goes unused.
export default function PlaceholderScreen({ title, width = 'wide' }: PlaceholderScreenProps) {
  return (
    <Page width={width}>
      <PageHeader title={title} />
      <EmptyState title={UI_TEXT.placeholderScreen} />
    </Page>
  );
}
