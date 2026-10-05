import type { Metadata } from 'next';
import AllAssessmentsView from '@/components/views/assessments/AllAssessmentsView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = {
  title: routeForPattern('/admin/members/[memberId]/assessments').title,
};

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
