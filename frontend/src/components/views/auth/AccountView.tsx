import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import ChangePasswordButton from '@/components/pages/auth/ChangePasswordButton';
import ChangePasswordForm from '@/components/pages/auth/ChangePasswordForm';
import SignedInAs from '@/components/pages/auth/SignedInAs';
import SignOutSection from '@/components/pages/auth/SignOutSection';
import { UI_TEXT } from '@/lib/messages/words';

const FORM_ID = 'change-password-form';

// S17 Settings → Account (`/admin/settings/account`), 720 px wide. The one main action is "Change password"
// (header on desktop, bar on phones, tabs hidden because this is a form: BR-REC-120, 121).
export default function AccountView() {
  return (
    <Page width="narrow">
      <PageHeader
        title={UI_TEXT.screens.account}
        backHref="/admin/settings"
        form
        action={<ChangePasswordButton formId={FORM_ID} />}
      />
      <SignedInAs />
      <ChangePasswordForm formId={FORM_ID} />
      <SignOutSection />
    </Page>
  );
}
