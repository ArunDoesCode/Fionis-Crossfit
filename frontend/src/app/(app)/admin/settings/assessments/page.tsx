import type { Metadata } from 'next';
import AssessmentSetupView from '@/components/views/setup/AssessmentSetupView';
import { routeForPattern } from '@/lib/routes';

// BR-REC-234: the tab title comes from the route table ("%s · Fionis India" template in the root layout).
export const metadata: Metadata = { title: routeForPattern('/admin/settings/assessments').title };

export default function AssessmentSetupPage() {
  return <AssessmentSetupView />;
}
