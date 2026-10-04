import ReportCardView from '@/components/views/progress/ReportCardView';

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function ReportCardPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <ReportCardView memberId={memberId} />;
}
