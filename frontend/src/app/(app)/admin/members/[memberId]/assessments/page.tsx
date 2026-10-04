import AllAssessmentsView from '@/components/views/assessments/AllAssessmentsView';

// S11. The id is runtime data: the route's loading.tsx is the boundary while it resolves; `?type=` and
// `?open=` are read by the client leaf (nuqs), so the page itself stays static around it.
export default async function AllAssessmentsPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <AllAssessmentsView memberId={memberId} />;
}
