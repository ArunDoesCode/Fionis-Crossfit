import type { Metadata } from 'next';
import GymProgressView from '@/components/views/progress/GymProgressView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/reports').title };

// S13. The measurement and the filters are in the URL (`?metric=`, `?joinedFrom=` …), read by the client leaf
// under the route's loading.tsx.
export default function ReportsPage() {
  return <GymProgressView />;
}
