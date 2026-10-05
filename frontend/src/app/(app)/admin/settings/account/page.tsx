import type { Metadata } from 'next';
import AccountView from '@/components/views/auth/AccountView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/settings/account').title };

export default function AccountPage() {
  return <AccountView />;
}
