import type { Metadata } from 'next';
import LoginView from '@/components/views/auth/LoginView';
import { SESSION_ENDED_REASON } from '@/lib/auth/loginUrl';
import { routeForPattern } from '@/lib/routes';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/login').title };

// `next` (the page asked for) and `reason=expired` ("Please sign in again") come from proxy.ts and the
// global 401 handler. `next` is checked again by `safeNextPath` when the sign-in succeeds (BR-REC-39).
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, reason } = await searchParams;
  return <LoginView next={first(next)} expired={first(reason) === SESSION_ENDED_REASON} />;
}
