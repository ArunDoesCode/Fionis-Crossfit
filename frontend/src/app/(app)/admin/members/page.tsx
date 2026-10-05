import type { Metadata } from 'next';
import MembersView from '@/components/views/members/MembersView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/members').title };

// S5. The search text and the chip are in the URL (`?q=`, `?status=`), read by the client leaf under the
// route's loading.tsx.
export default function MembersPage() {
  return <MembersView />;
}
