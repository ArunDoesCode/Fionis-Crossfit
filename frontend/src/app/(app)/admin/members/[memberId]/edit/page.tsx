import EditMemberView from '@/components/views/members/EditMemberView';

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  return <EditMemberView memberId={memberId} />;
}
