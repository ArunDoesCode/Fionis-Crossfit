'use client';

import { type UseFormReturn, useWatch } from 'react-hook-form';
import {
  ChipsControl,
  DurationControl,
  NumberControl,
  SwitchControl,
  TextControl,
} from '@/components/pages/setup/FormControls';
import { datatypeLabel, tablePartLabel } from '@/lib/setup/describe';
import type { MeasurementFormValues } from '@/lib/setup/form';
import { SETUP_TEXT } from '@/lib/setup/text';
import { TABLE_PARTS, type TablePart } from '@/lib/validators/setup';

type MeasurementForm = UseFormReturn<MeasurementFormValues>;

const text = SETUP_TEXT.measurementSheet;

const KIND_OPTIONS = [
  { value: 'number', label: text.kindNumber },
  { value: 'duration', label: text.kindTime },
] as const;
const DECIMAL_OPTIONS = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
] as const;
const BETTER_OPTIONS = [
  { value: 'higher', label: text.higher },
  { value: 'lower', label: text.lower },
  { value: 'none', label: text.none },
] as const;
const REPEAT_OPTIONS = [
  { value: 'same', label: text.sameAsAssessment },
  { value: 'own', label: text.ownRepeat },
] as const;
const UNIT_OPTIONS = [
  { value: 'week', label: text.weeks },
  { value: 'month', label: text.months },
] as const;
const REPORT_OPTIONS = [
  { value: 'none', label: text.reportNone },
  { value: 'place', label: text.reportPlace },
] as const;
const PART_OPTIONS = TABLE_PARTS.map((part: TablePart) => ({
  value: part,
  label: tablePartLabel(part),
}));

/** Element ids per field (also where "jump to the first problem" lands; a Time field starts at its minutes box). */
export function measurementFieldIds(base: string, isTime: boolean) {
  return {
    name: `${base}-name`,
    unit: `${base}-unit`,
    plausibleMin: isTime ? `${base}-below-min` : `${base}-below`,
    plausibleMax: isTime ? `${base}-above-min` : `${base}-above`,
    intervalCount: `${base}-count`,
    tableGroup: `${base}-group`,
    isActive: `${base}-on`,
  };
}

interface MeasurementFieldsProps {
  form: MeasurementForm;
  /** Base for the element ids (the sheet's form id). */
  base: string;
  /** Editing a measurement that already has results: kind and unit are locked (BR-REC-11). */
  locked: boolean;
  /** Editing (the On switch is shown); a new measurement is always On. */
  isEdit: boolean;
}

// The measurement sheet's one-column form (BR-REC-134): name, kind, unit, decimals, better, "please check"
// range, repeat, report table, On. Time hides unit and decimals (it is always min:sec, C3) and takes the
// check range in minutes and seconds, saved as seconds. Only plain words (BR-REC-126).
export default function MeasurementFields({ form, base, locked, isEdit }: MeasurementFieldsProps) {
  const control = form.control;
  const datatype = useWatch({ control, name: 'datatype' });
  const repeat = useWatch({ control, name: 'repeat' });
  const reportTable = useWatch({ control, name: 'reportTable' });
  const isTime = datatype === 'duration';
  const ids = measurementFieldIds(base, isTime);
  // The check range and unit mean something else for the other kind, so they start empty again.
  const onKindPick = (kind: 'number' | 'duration') => {
    form.setValue('unit', '');
    form.setValue('decimals', kind === 'number' ? '1' : '0');
    form.setValue('plausibleMin', '');
    form.setValue('plausibleMax', '');
    form.clearErrors(['unit', 'plausibleMin', 'plausibleMax']);
  };

  return (
    <div className="flex flex-col gap-2">
      <TextControl control={control} name="name" id={ids.name} label={text.name} required />

      {locked ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{text.kind}</p>
          <p className="text-base">{datatypeLabel(datatype)}</p>
          <p className="text-sm text-muted-foreground">{text.kindLocked}</p>
        </div>
      ) : (
        <ChipsControl
          control={control}
          name="datatype"
          legend={text.kind}
          required
          options={KIND_OPTIONS}
          onPick={onKindPick}
        />
      )}

      {isTime ? (
        <p className="text-sm text-muted-foreground">{text.timeUnit}</p>
      ) : (
        <>
          <TextControl
            control={control}
            name="unit"
            id={ids.unit}
            label={text.unit}
            disabled={locked}
          />
          <ChipsControl
            control={control}
            name="decimals"
            legend={text.decimals}
            options={DECIMAL_OPTIONS}
          />
        </>
      )}

      <ChipsControl control={control} name="better" legend={text.better} options={BETTER_OPTIONS} />

      <div className="flex flex-col gap-2">
        {isTime ? (
          <>
            <DurationControl
              control={control}
              name="plausibleMin"
              id={`${base}-below`}
              label={text.pleaseCheckBelow}
            />
            <DurationControl
              control={control}
              name="plausibleMax"
              id={`${base}-above`}
              label={text.pleaseCheckAbove}
            />
          </>
        ) : (
          <>
            <NumberControl
              control={control}
              name="plausibleMin"
              id={ids.plausibleMin}
              label={text.pleaseCheckBelow}
            />
            <NumberControl
              control={control}
              name="plausibleMax"
              id={ids.plausibleMax}
              label={text.pleaseCheckAbove}
            />
          </>
        )}
        <p className="text-sm text-muted-foreground">
          {isTime ? text.pleaseCheckHintTime : text.pleaseCheckHint}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <ChipsControl
          control={control}
          name="repeat"
          legend={text.repeatEvery}
          options={REPEAT_OPTIONS}
        />
        {repeat === 'own' && (
          <>
            <NumberControl
              control={control}
              name="intervalCount"
              id={ids.intervalCount}
              label={text.ownRepeatNumber}
              required
            />
            <ChipsControl
              control={control}
              name="intervalUnit"
              legend={text.weeksOrMonths}
              hideLegend
              options={UNIT_OPTIONS}
            />
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <ChipsControl
          control={control}
          name="reportTable"
          legend={text.reportTable}
          options={REPORT_OPTIONS}
        />
        {reportTable === 'place' && (
          <>
            <TextControl
              control={control}
              name="tableGroup"
              id={ids.tableGroup}
              label={text.group}
              hint={text.groupHint}
              required
            />
            <ChipsControl
              control={control}
              name="tablePart"
              legend={text.part}
              required
              options={PART_OPTIONS}
            />
          </>
        )}
      </div>

      {isEdit && (
        <SwitchControl
          control={control}
          name="isActive"
          id={ids.isActive}
          label={text.on}
          hint={text.onHint}
        />
      )}
    </div>
  );
}
