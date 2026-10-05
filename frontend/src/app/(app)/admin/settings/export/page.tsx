import type { Metadata } from 'next';
import ExportView from '@/components/views/progress/ExportView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/settings/export').title };

export default function ExportPage() {
  return <ExportView />;
}
