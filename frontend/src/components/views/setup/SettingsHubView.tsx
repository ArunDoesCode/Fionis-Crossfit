import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { Route } from 'next';
import ListRow, { RowList } from '@/components/common/ListRow';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';
import Section from '@/components/common/Section';
import ThemeChoice from '@/components/pages/setup/ThemeChoice';
import { SETUP_TEXT } from '@/lib/setup/text';

const text = SETUP_TEXT.hub;

const Chevron = () => (
  <HugeiconsIcon
    icon={ArrowRight01Icon}
    strokeWidth={2}
    aria-hidden="true"
    className="size-5 text-muted-foreground"
  />
);

// S14 Settings hub (`/admin/settings`), 720 px wide on desktop (the same list). No main action: every row
// leads to a screen. Export data is built by the progress stream; until then its row opens a 404.
export default function SettingsHubView() {
  return (
    <Page width="narrow">
      <PageHeader title={text.title} />
      <RowList>
        <ListRow
          title={text.assessments.title}
          detail={text.assessments.detail}
          href="/admin/settings/assessments"
          status={<Chevron />}
        />
        <ListRow
          title={text.general.title}
          detail={text.general.detail}
          href="/admin/settings/general"
          status={<Chevron />}
        />
        <ListRow
          title={text.account.title}
          detail={text.account.detail}
          href="/admin/settings/account"
          status={<Chevron />}
        />
        <ListRow
          title={text.export.title}
          detail={text.export.detail}
          href={'/admin/settings/export' as Route}
          status={<Chevron />}
        />
      </RowList>
      <Section title={text.theme.legend}>
        <ThemeChoice />
      </Section>
    </Page>
  );
}
