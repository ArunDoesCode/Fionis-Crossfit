import type { Metadata } from 'next';
import EditMemberView from '@/components/views/members/EditMemberView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = {
  title: routeForPattern('/admin/members/[memberId]/edit').title,
};

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <EditMemberView memberId={memberId} />;
}
