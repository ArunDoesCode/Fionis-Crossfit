'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loading03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type FormEvent, useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import ErrorState from '@/components/common/ErrorState';
import {
  FormErrorSummary,
  FormGrid,
  focusField,
  useFocusFirstProblem,
} from '@/components/common/form';
import PageHeader from '@/components/common/PageHeader';
import EntryDateSection from '@/components/pages/assessments/EntryDateSection';
import EntryFields from '@/components/pages/assessments/EntryFields';
import { EntrySkeleton } from '@/components/pages/assessments/EntryLoading';
import { NeedOneValue, OfferNotice, StatusLine } from '@/components/pages/assessments/EntryNotices';
import {
  CheckValuesSheetLazy,
  LeaveDialogLazy,
  preloadEntrySheets,
} from '@/components/pages/assessments/LazySheets';
import { Button } from '@/components/ui/button';
import { useEntryForm, useMemberDue } from '@/lib/api/assessments/queries';
import { isApiError } from '@/lib/api/errors';
import { draftKey } from '@/lib/assessments/draft';
import { dueMetricIds } from '@/lib/assessments/dueStatus';
import { entryOrder, flatErrors, valueName } from '@/lib/assessments/entryErrors';
import { inputsOf, isChanged } from '@/lib/assessments/entryValues';
import { ASSESSMENT_TEXT } from '@/lib/assessments/text';
import { useDraftAutosave } from '@/lib/assessments/useDraftAutosave';
import { useEntrySchema } from '@/lib/assessments/useEntrySchema';
import { useEntrySession } from '@/lib/assessments/useEntrySession';
import { useLeaveGuard } from '@/lib/assessments/useLeaveGuard';
import { useSaveFlow } from '@/lib/assessments/useSaveFlow';
import { messageForCode } from '@/lib/messages/errors';
import { UI_TEXT } from '@/lib/messages/words';
import type { EntryFormInput, EntryFormValues } from '@/lib/validators/assessments';

const FORM_ID = 'assess-form';
// An opened saved assessment left unchanged keeps no draft: every box counts as empty then.
const NOTHING_TYPED = {};
const NO_MEMBER = { fullName: '', joinedOn: '' };

interface SaveBarProps {
  /** The id of the `<form>`: the buttons sit in the page header, outside it. */
  formId: string;
  saving: boolean;
  /** "Save & next date" is the one saving. */
  savingNext: boolean;
}

// The screen's one main action (BR-REC-121): "Save" with "Save & next date" beside it (BR-REC-84). Both are
// submit buttons of the form, so Enter in a field saves; Save comes first in the page so it is the form's
// default button (Enter never means "next date"), and the row is reversed to show it on the right. Both stay
// tappable with problems (Save then jumps to the first one, BR-REC-189) and are off only while saving.
function SaveBar({ formId, saving, savingNext }: SaveBarProps) {
  const spinner = (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={2}
      className="animate-spin"
      aria-hidden="true"
    />
  );
  return (
    <div className="flex w-full flex-row-reverse gap-2 *:flex-1 lg:w-auto lg:*:flex-none">
      <Button type="submit" form={formId} disabled={saving}>
        {saving && !savingNext && spinner}
        {saving && !savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.save}
      </Button>
      <Button type="submit" form={formId} data-next="true" variant="secondary" disabled={saving}>
        {savingNext && spinner}
        {savingNext ? UI_TEXT.saving : ASSESSMENT_TEXT.saveNextDate}
      </Button>
    </div>
  );
}

interface EntryScreenProps {
  memberId: string;
  typeId: string;
  /** The date in the address, else today (the device's day). */
  initialDate: string;
  today: string;
}

// S10 Record assessment for one member and one assessment (BR-REC-12, 19–21, 74–86, 90, 91, 190). Re-keyed by
// the caller when the member or the assessment changes; the date is a form field, so changing it keeps what
// was typed (BR-REC-74). React Hook Form + Zod (D-034): a number is text until Save and the schema parses it
// (BR-REC-76); drafts are written from the watched values and the leave question follows what changed (D19).
export default function EntryScreen({ memberId, typeId, initialDate, today }: EntryScreenProps) {
  const form = useForm<EntryFormInput, unknown, EntryFormValues>({
    resolver: (values, context, options) => zodResolver(schema.current)(values, context, options),
    defaultValues: { date: initialDate, isEstimated: false, values: {} },
    mode: 'onTouched',
  });
  const date = useWatch({ control: form.control, name: 'date' });
  const query = useEntryForm(memberId, typeId, date);
  const { data } = query;
  const schema = useEntrySchema(data, today);
  const { session, moveToDate, answerOffer, startNext } = useEntrySession({
    form,
    memberId,
    typeId,
    date,
    data,
    fresh: !query.isFetching && !query.isPlaceholderData,
  });
  const member = data?.member ?? NO_MEMBER;
  const due = useMemberDue(memberId);
  const metrics = useMemo(() => data?.metrics ?? [], [data]);
  const memberHref = `/admin/members/${memberId}` as const;

  const typed: EntryFormInput = useWatch({ control: form.control }) as EntryFormInput;
  // RHF's own flag is the cheap gate; `isChanged` is D19 (a date alone, About on a new one, "95.50" over 95.5
  // are not changes).
  const changed = form.formState.isDirty && isChanged(typed, session);
  const key = date === '' ? null : draftKey(memberId, typeId, date);
  const draftInputs = useMemo(() => inputsOf(typed.values ?? {}), [typed.values]);
  useDraftAutosave({
    key,
    // Only an offered draft pauses it (writing now would erase that draft); "open the saved one?" does not.
    active: key !== null && session.loadedFor === date && session.offer?.kind !== 'draft',
    isEstimated: typed.isEstimated,
    inputs: changed ? draftInputs : NOTHING_TYPED,
  });

  const guard = useLeaveGuard(changed, memberHref);
  useEffect(() => {
    if (changed) preloadEntrySheets(); // the check sheet and the leave question may be needed now
  }, [changed]);

  const order = useMemo(() => entryOrder(metrics.map((metric) => metric.id)), [metrics]);
  const focusFirst = useFocusFirstProblem(order);
  const flow = useSaveFlow({
    memberId,
    typeId,
    member,
    metrics,
    session,
    changed,
    getTyped: form.getValues,
    onNext: () => {
      startNext();
      requestAnimationFrame(() => focusField('date'));
    },
    exitToStart: guard.exitToStart,
    focusFirstValue: () => {
      const first = metrics[0];
      if (first) focusField(valueName(first.id));
    },
  });

  const { clearNeedOne } = flow;
  useEffect(() => {
    const subscription = form.watch((_values, { type }) => {
      if (type === 'change') clearNeedOne();
    });
    return () => subscription.unsubscribe();
  }, [form, clearNeedOne]);

  // Real submit: Enter in a field and both Save buttons come here. Save is the form's default button; the
  // other one says it wants the next date.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const next = submitter instanceof HTMLElement && submitter.dataset.next === 'true';
    void form.handleSubmit(
      (valid) => flow.save(valid, next),
      (errors) => focusFirst(flatErrors(errors)),
    )(event);
  };

  const labels = useMemo(
    () => ({
      date: ASSESSMENT_TEXT.date,
      ...Object.fromEntries(metrics.map((metric) => [valueName(metric.id), metric.name])),
    }),
    [metrics],
  );

  let body: React.ReactNode;
  if (!data) {
    const missing = isApiError(query.error) && query.error.status === 404;
    body = query.isError ? (
      <ErrorState
        message={missing ? messageForCode('NOT_FOUND') : undefined}
        onRetry={missing ? undefined : () => void query.refetch()}
      />
    ) : (
      <EntrySkeleton />
    );
  } else {
    body = (
      <form id={FORM_ID} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        <NeedOneValue tick={flow.needOne} />
        {form.formState.isSubmitted && (
          <FormErrorSummary
            errors={flatErrors(form.formState.errors)}
            order={order}
            labels={labels}
          />
        )}
        {session.offer && (
          <OfferNotice offer={session.offer} date={date} today={today} onAnswer={answerOffer} />
        )}
        <FormGrid maxCols={4}>
          <EntryDateSection
            control={form.control}
            date={date}
            isEstimated={typed.isEstimated}
            opened={session.opened}
            member={member}
            today={today}
            onMoveToDate={moveToDate}
          />
          <EntryFields
            control={form.control}
            metrics={metrics}
            baseline={session.baseline}
            dueIds={dueMetricIds(due.data, typeId)}
            stale={query.isPlaceholderData}
            submitted={form.formState.isSubmitted}
            today={today}
          />
        </FormGrid>
        <StatusLine text={flow.status} />
      </form>
    );
  }

  return (
    <>
      <PageHeader
        title={data?.type.name ?? UI_TEXT.screens.recordAssessment}
        subtitle={data?.member.fullName}
        form
        action={
          data ? (
            <SaveBar formId={FORM_ID} saving={flow.saving} savingNext={flow.savingNext} />
          ) : undefined
        }
      />
      {body}
      <CheckValuesSheetLazy
        open={flow.check.open}
        onOpenChange={(open) => {
          if (!open) flow.goBack();
        }}
        lines={flow.check.lines}
        onGoBack={flow.goBack}
        onSaveAnyway={flow.saveAnyway}
      />
      <LeaveDialogLazy open={guard.open} onStay={guard.stay} onLeave={guard.leave} />
    </>
  );
}
