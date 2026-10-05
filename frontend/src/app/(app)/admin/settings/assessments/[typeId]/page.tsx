import type { Metadata } from 'next';
import AssessmentDetailView from '@/components/views/setup/AssessmentDetailView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = {
  title: routeForPattern('/admin/settings/assessments/[typeId]').title,
};

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function AssessmentDetailPage({
  params,
}: {
  params: Promise<{ typeId: string }>;
}) {
  const { typeId } = await params;
  return <AssessmentDetailView typeId={typeId} />;
}
