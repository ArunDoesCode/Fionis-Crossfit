import Page from '@/components/common/Page';
import EntryLoading from '@/components/pages/assessments/EntryLoading';

// Grey shapes in the real layout while the screen loads (BR-REC-129, 143).
export default function Loading() {
  return (
    <Page width="wide">
      <EntryLoading />
    </Page>
  );
}
