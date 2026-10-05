import type { Metadata } from 'next';
import AddMemberView from '@/components/views/members/AddMemberView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/members/new').title };

// S6. Its own route, so `/admin/members/new` is not read as a member id.
export default function AddMemberPage() {
  return <AddMemberView />;
}
