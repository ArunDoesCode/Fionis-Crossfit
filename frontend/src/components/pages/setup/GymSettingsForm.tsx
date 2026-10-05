'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { FormErrorSummary, FormGrid, useFocusFirstProblem } from '@/components/common/form';
import Section from '@/components/common/Section';
import { NumberField, TextField, TimeZoneField } from '@/components/pages/setup/FormControls';
import type { Settings } from '@/lib/api/setup/fetchers';
import { useUpdateSettings } from '@/lib/api/setup/queries';
import { gymSettingsToValues, settingsUpdateBody } from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { timeZoneOptions } from '@/lib/setup/timezones';
import { gymSettingsSchema } from '@/lib/validators/setup';

interface GymSettingsFormProps {
  settings: Settings;
  /** The page header's Save button submits this form (BR-REC-121: the one main action). */
  formId: string;
}

const FIELD_ORDER = ['gymName', 'timezone', 'upcomingLeadDays', 'expiryLeadDays'] as const;

// S16 (BR-REC-60): gym name, time zone, "Due soon" days, "Ends soon" days. Checked when a field is left
// and on Save; Save stays tappable and jumps to the first problem (BR-REC-189); no Reset button. A Save
// with no edits sends nothing and says nothing (BR-REC-190). The Save button is in the page header
// / action bar. The success toast lives in the mutation hook.
export default function GymSettingsForm({ settings, formId }: GymSettingsFormProps) {
  const text = SETUP_TEXT.general;
  const update = useUpdateSettings();
  const focusFirst = useFocusFirstProblem(FIELD_ORDER);
  const form = useForm<
    z.input<typeof gymSettingsSchema>,
    unknown,
    z.output<typeof gymSettingsSchema>
  >({
    resolver: zodResolver(gymSettingsSchema),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
    shouldFocusError: false,
    defaultValues: gymSettingsToValues(settings),
  });

  const onValid = (input: z.output<typeof gymSettingsSchema>) => {
    // A second Enter can arrive before the header button turns off: one try, one request.
    if (update.isPending) return;
    const body = settingsUpdateBody(settings, input);
    if (Object.keys(body).length === 0) {
      form.reset(gymSettingsToValues({ ...settings, ...input }));
      return;
    }
    update.mutate(body);
  };

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onValid, focusFirst)}
      className="section-gap flex flex-col"
    >
      <FormErrorSummary
        errors={form.formState.errors}
        order={FIELD_ORDER}
        labels={{
          gymName: text.gymName,
          timezone: text.timezone,
          upcomingLeadDays: text.dueSoonDays,
          expiryLeadDays: text.endsSoonDays,
        }}
      />
      <Section title={text.gymSection}>
        <FormGrid maxCols={2}>
          <TextField
            control={form.control}
            name="gymName"
            label={text.gymName}
            hint={text.gymNameHint}
            required
          />
          <TimeZoneField
            control={form.control}
            name="timezone"
            label={text.timezone}
            hint={text.timezoneHint}
            options={timeZoneOptions(settings.timezone)}
          />
        </FormGrid>
      </Section>
      <Section title={text.remindersSection}>
        <FormGrid maxCols={2}>
          <NumberField
            control={form.control}
            name="upcomingLeadDays"
            label={text.dueSoonDays}
            hint={text.dueSoonHint}
            unit={text.daysUnit}
            required
          />
          <NumberField
            control={form.control}
            name="expiryLeadDays"
            label={text.endsSoonDays}
            hint={text.endsSoonHint}
            unit={text.daysUnit}
            required
          />
        </FormGrid>
      </Section>
    </form>
  );
}
