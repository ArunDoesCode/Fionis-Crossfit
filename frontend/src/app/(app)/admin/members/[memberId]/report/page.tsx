import PlaceholderScreen from '@/components/common/PlaceholderScreen';
import { UI_TEXT } from '@/lib/messages/words';

// Placeholder until the owning stream builds this screen.
export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return (
    <PlaceholderScreen
      title={UI_TEXT.screens.reportCard}
      width="wide"
      backHref={`/admin/members/${memberId}`}
    />
  );
}
