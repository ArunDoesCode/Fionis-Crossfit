'use client';

import { useEffect, useReducer } from 'react';
import ErrorState from '@/components/common/ErrorState';
import PageHeader from '@/components/common/PageHeader';
import EntryDateFields from '@/components/pages/assessments/EntryDateFields';
import EntryFields from '@/components/pages/assessments/EntryFields';
import { OfferNotice, StatusLine } from '@/components/pages/assessments/EntryNotices';
import EntrySkeleton from '@/components/pages/assessments/EntrySkeleton';
import {
  CheckValuesSheetLazy,
  LeaveDialogLazy,
  preloadEntrySheets,
} from '@/components/pages/assessments/LazySheets';
import SaveBar from '@/components/pages/assessments/SaveBar';
import { useEntryForm, useMemberDue } from '@/lib/api/assessments/queries';
import { isApiError } from '@/lib/api/errors';
import { browserDraftStorage, clearDraft, draftKey } from '@/lib/assessments/draft';
import { dueMetricIds } from '@/lib/assessments/dueStatus';
import {
  type EntryAction,
  emptyEntry,
  entryReducer,
  hasTypedValues,
  isChanged,
} from '@/lib/assessments/entryState';
import { useDraftAutosave } from '@/lib/assessments/useDraftAutosave';
import { useEntryLoader } from '@/lib/assessments/useEntryLoader';
import { useLeaveGuard } from '@/lib/assessments/useLeaveGuard';
import { useSaveFlow } from '@/lib/assessments/useSaveFlow';
import { messageForCode } from '@/lib/messages/errors';
import { UI_TEXT } from '@/lib/messages/words';

const FORM_ID = 'assess-form';
// An opened saved assessment left unchanged keeps no draft: every box counts as empty then.
const NOTHING_TYPED = {};

interface EntryScreenProps {
  memberId: string;
  typeId: string;
  /** The date in the address, else today (the device's day). */
  initialDate: string;
  today: string;
}

// S10 Record assessment for one member and one assessment (BR-REC-12, 19–21, 74–86, 90, 91). Re-keyed by
// the caller when the member or the assessment changes; the date lives here, so changing it keeps what was
// typed (BR-REC-74). The form is plain state (`entryReducer`): a number is text until Save and `buildSaveValues`
// is its validator (BR-REC-76), so 15–60 fields stay cheap and there is no schema to keep in step.
export default function EntryScreen({ memberId, typeId, initialDate, today }: EntryScreenProps) {
  const [state, dispatch] = useReducer(entryReducer, initialDate, emptyEntry);
  const form = useEntryForm(memberId, typeId, state.date);
  const due = useMemberDue(memberId);
  const { data } = form;
  const memberHref = `/admin/members/${memberId}` as const;

  useEntryLoader({
    memberId,
    typeId,
    state,
    dispatch,
    data,
    fresh: !form.isFetching && !form.isPlaceholderData,
  });

  const dirty = isChanged(state);
  const key = state.date === '' ? null : draftKey(memberId, typeId, state.date);
  useDraftAutosave({
    key,
    // Only an offered draft pauses it (writing now would erase that draft); "open the saved one?" does not.
    active: key !== null && state.loadedFor === state.date && state.offer?.kind !== 'draft',
    isEstimated: state.isEstimated,
    inputs: dirty ? state.inputs : NOTHING_TYPED,
  });

  const guard = useLeaveGuard(dirty, memberHref);
  useEffect(() => {
    if (dirty) preloadEntrySheets(); // the check sheet and the leave question may be needed now
  }, [dirty]);

  const member = data?.member ?? { fullName: '', joinedOn: '' };
  const metrics = data?.metrics ?? [];
  const flow = useSaveFlow({
    memberId,
    typeId,
    member,
    today,
    formId: FORM_ID,
    metrics,
    state,
    dispatch,
    exitToStart: guard.exitToStart,
  });

  // A date picked while values are typed takes them along; the draft of the old date goes with them (BR-REC-85).
  const onDateAction = (action: EntryAction) => {
    const moving =
      (action.type === 'date' || action.type === 'paper') && action.date !== state.date;
    if (moving && state.opened === null && key !== null && hasTypedValues(state.inputs)) {
      const storage = browserDraftStorage();
      if (storage) clearDraft(storage, key);
    }
    dispatch(action);
  };

  const answerOffer = (answer: 'restore' | 'discard' | 'open' | 'keep') => {
    if (answer === 'discard' && key !== null) {
      const storage = browserDraftStorage();
      if (storage) clearDraft(storage, key);
    }
    dispatch({ type: 'answer', answer, metrics });
  };

  let body: React.ReactNode;
  if (!data) {
    const missing = isApiError(form.error) && form.error.status === 404;
    body = form.isError ? (
      <ErrorState
        message={missing ? messageForCode('NOT_FOUND') : undefined}
        onRetry={missing ? undefined : () => void form.refetch()}
      />
    ) : (
      <EntrySkeleton />
    );
  } else {
    body = (
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => event.preventDefault()}
        className="flex flex-col gap-4"
      >
        {state.offer && (
          <OfferNotice offer={state.offer} date={state.date} today={today} onAnswer={answerOffer} />
        )}
        <EntryDateFields
          formId={FORM_ID}
          state={state}
          member={member}
          today={today}
          attempted={flow.attempted}
          dispatch={onDateAction}
        />
        <EntryFields
          formId={FORM_ID}
          metrics={metrics}
          state={state}
          attempted={flow.attempted}
          dueIds={dueMetricIds(due.data, typeId)}
          stale={form.isPlaceholderData}
          today={today}
          dispatch={dispatch}
        />
        <StatusLine text={flow.status} />
      </form>
    );
  }

  return (
    <>
      <PageHeader
        title={data?.type.name ?? UI_TEXT.screens.recordAssessment}
        subtitle={data?.member.fullName}
        backHref={memberHref}
        form
        action={
          data ? (
            <SaveBar saving={flow.saving} savingNext={flow.savingNext} onSave={flow.save} />
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
