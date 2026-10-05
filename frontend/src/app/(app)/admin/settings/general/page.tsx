import type { Metadata } from 'next';
import GymSettingsView from '@/components/views/setup/GymSettingsView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/settings/general').title };

export default function GeneralSettingsPage() {
  return <GymSettingsView />;
}
