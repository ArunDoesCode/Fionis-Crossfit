import type { Metadata } from 'next';
import MemberView from '@/components/views/member/MemberView';
import { API_ROUTES, apiPath } from '@/lib/api/routes';
import { serverApi } from '@/lib/api/server';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title is the member's name. If the name cannot be fetched (expired sign-in, API down)
// the title falls back to the route's own "Member"; the page itself loads its data on the client.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ memberId: string }>;
}): Promise<Metadata> {
  const fallback = routeForPattern('/admin/members/[memberId]').title;
  try {
    const { memberId } = await params;
    const res = await serverApi.get<{ data: { fullName: string } }>(
      apiPath(API_ROUTES.MEMBERS.DETAIL, { memberId }),
      { timeoutMs: 3_000 },
    );
    return { title: res.data.fullName || fallback };
  } catch {
    return { title: fallback };
  }
}

// The id is runtime data: the route's loading.tsx is the boundary while it resolves.
export default async function MemberPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  return <MemberView memberId={memberId} />;
}
