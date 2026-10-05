import type { Metadata } from 'next';
import MembershipsEndingView from '@/components/views/members/MembershipsEndingView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/memberships').title };

// S4. The tab is in the URL (`?tab=ending|ended`), read by the client leaf under the route's loading.tsx.
export default function MembershipsEndingPage() {
  return <MembershipsEndingView />;
}
