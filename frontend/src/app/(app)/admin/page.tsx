import type { Metadata } from 'next';
import HomeView from '@/components/views/home/HomeView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin').title };

export default function AdminPage() {
  return <HomeView />;
}
