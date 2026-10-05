import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import MemberView from '@/components/views/member/MemberView';
import { memberKeys } from '@/lib/api/members/queries';
import { getMemberOnServer } from '@/lib/api/members/server';
import { getQueryClient } from '@/lib/queryClient';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title is the member's name. If the name cannot be fetched (expired sign-in, API down)
// the title falls back to the route's own "Member"; the page itself loads its data on the client.
// BR-REC-213: the title and the page's prefetch share one server read of the member (`getMemberOnServer`).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ memberId: string }>;
}): Promise<Metadata> {
  const fallback = routeForPattern('/admin/members/[memberId]').title;
  try {
    const { memberId } = await params;
    const member = await getMemberOnServer(memberId);
    return { title: member.fullName || fallback };
  } catch {
    return { title: fallback };
  }
}

// The id is runtime data: the route's loading.tsx is the boundary while it resolves. The member read is
// handed to the client cache under the same key `useMember` uses, so the page does not ask again; a failed
// read is not handed over and the client asks for itself (it shows its own error or "not found").
export default async function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: memberKeys.detail(memberId),
    queryFn: () => getMemberOnServer(memberId),
  });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MemberView memberId={memberId} />
    </HydrationBoundary>
  );
}
