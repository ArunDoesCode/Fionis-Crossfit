import PlaceholderScreen from '@/components/common/PlaceholderScreen';
import { UI_TEXT } from '@/lib/messages/words';

// Placeholder until the owning stream builds this screen.
export default async function RecordAssessmentPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return (
    <PlaceholderScreen
      title={UI_TEXT.screens.recordAssessment}
      width="narrow"
      backHref={`/admin/members/${memberId}`}
    />
  );
}
