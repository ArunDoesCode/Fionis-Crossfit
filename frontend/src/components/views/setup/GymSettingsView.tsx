'use client';

import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import { FormSkeleton } from '@/components/common/Skeletons';
import GymSettingsForm from '@/components/pages/setup/GymSettingsForm';
import GymSettingsSaveButton from '@/components/pages/setup/GymSettingsSaveButton';
import { useSettings } from '@/lib/api/setup/queries';

const FORM_ID = 'gym-settings-form';

// S16 Reminders & gym (`/admin/settings/general`), 720 px wide. Main action: Save (header on desktop, bar on
// phones with the tab bar hidden, because this is a form: BR-REC-120, 121). The settings are read again on
// every open (staleTime 0, ETag 304 when unchanged: BR-REC-72).
export default function GymSettingsView() {
  const settings = useSettings();
  const data = settings.data;

  return (
    <Page width="narrow">
      <PageHeader form action={data ? <GymSettingsSaveButton formId={FORM_ID} /> : undefined} />
      {data ? (
        // A change made on another device (or just saved here) starts the form again from the new values.
        <GymSettingsForm key={JSON.stringify(data)} settings={data} formId={FORM_ID} />
      ) : settings.isError ? (
        <ErrorState onRetry={() => settings.refetch()} />
      ) : (
        <FormSkeleton fields={4} />
      )}
    </Page>
  );
}
