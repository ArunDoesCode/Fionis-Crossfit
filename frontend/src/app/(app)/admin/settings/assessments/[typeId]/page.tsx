import AssessmentDetailView from '@/components/views/setup/AssessmentDetailView';

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ typeId: string }>;
}) {
  const { typeId } = await params;
  return <AssessmentDetailView typeId={typeId} />;
}
