'use client';

import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import Section from '@/components/common/Section';
import { NumberControl, SelectControl, TextControl } from '@/components/pages/setup/FormControls';
import { focusFirstProblem } from '@/components/pages/setup/focusFirstProblem';
import type { Settings } from '@/lib/api/setup/fetchers';
import { useUpdateSettings } from '@/lib/api/setup/queries';
import {
  type GymSettingsFormValues,
  gymSettingsToInput,
  gymSettingsToValues,
  parseGymSettings,
  schemaResolver,
  settingsUpdateBody,
} from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { timeZoneOptions } from '@/lib/setup/timezones';
import { gymSettingsSchema } from '@/lib/validators/setup';

interface GymSettingsFormProps {
  settings: Settings;
  /** The page header's Save button submits this form (BR-REC-121: the one main action). */
  formId: string;
}

const FIELD_ORDER = ['gymName', 'timezone', 'upcomingLeadDays', 'expiryLeadDays'] as const;

// S16 (BR-REC-60): gym name, time zone, "Due soon" days, "Ends soon" days. One column, labels above the
// fields, checked when a field is left and on Save; Save stays tappable and jumps to the first problem and
// there is no Reset button (BR-REC-134). The Save button is in the page header / action bar.
export default function GymSettingsForm({ settings, formId }: GymSettingsFormProps) {
  const text = SETUP_TEXT.general;
  const update = useUpdateSettings();
  const form = useForm<GymSettingsFormValues>({
    resolver: schemaResolver(gymSettingsSchema, gymSettingsToInput),
    mode: 'onBlur',
    shouldFocusError: false,
    defaultValues: gymSettingsToValues(settings),
  });

  const ids = {
    gymName: `${formId}-gym-name`,
    timezone: `${formId}-timezone`,
    upcomingLeadDays: `${formId}-due-soon`,
    expiryLeadDays: `${formId}-ends-soon`,
  };

  const onValid = (values: GymSettingsFormValues) => {
    // A second Enter can arrive before the header button turns off: one try, one request.
    if (update.isPending) return;
    const input = parseGymSettings(values);
    const body = settingsUpdateBody(settings, input);
    if (Object.keys(body).length === 0) {
      form.reset(gymSettingsToValues({ ...settings, ...input }));
      toast.success(SETUP_TEXT.toasts.settingsSaved);
      return;
    }
    update.mutate(body);
  };

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit(onValid, (errors) => focusFirstProblem(errors, FIELD_ORDER, ids))}
      className="section-gap flex flex-col"
    >
      <Section title={text.gymSection}>
        <div className="flex flex-col gap-2">
          <TextControl
            control={form.control}
            name="gymName"
            id={ids.gymName}
            label={text.gymName}
            hint={text.gymNameHint}
            required
          />
          <SelectControl
            control={form.control}
            name="timezone"
            id={ids.timezone}
            label={text.timezone}
            hint={text.timezoneHint}
            options={timeZoneOptions(settings.timezone)}
          />
        </div>
      </Section>
      <Section title={text.remindersSection}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{text.dueSoonHint}</p>
          <NumberControl
            control={form.control}
            name="upcomingLeadDays"
            id={ids.upcomingLeadDays}
            label={text.dueSoonDays}
            unit={text.daysUnit}
            required
          />
          <p className="text-sm text-muted-foreground">{text.endsSoonHint}</p>
          <NumberControl
            control={form.control}
            name="expiryLeadDays"
            id={ids.expiryLeadDays}
            label={text.endsSoonDays}
            unit={text.daysUnit}
            required
          />
        </div>
      </Section>
    </form>
  );
}
