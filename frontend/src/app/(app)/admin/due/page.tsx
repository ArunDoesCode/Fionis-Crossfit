import type { Metadata } from 'next';
import DueListView from '@/components/views/due/DueListView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/due').title };

// S3. The tab and the assessment filter are in the URL (`?tab=overdue|soon&type=`), read by the client leaf
// under the route's loading.tsx.
export default function DueListPage() {
  return <DueListView />;
}
