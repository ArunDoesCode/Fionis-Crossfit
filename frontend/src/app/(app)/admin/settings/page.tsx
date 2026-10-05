import type { Metadata } from 'next';
import SettingsHubView from '@/components/views/setup/SettingsHubView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/settings').title };

export default function SettingsPage() {
  return <SettingsHubView />;
}
