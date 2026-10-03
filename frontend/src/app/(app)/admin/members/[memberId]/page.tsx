import MemberView from '@/components/views/member/MemberView';

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <MemberView memberId={memberId} />;
}
