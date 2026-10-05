'use client';

import { type UseFormReturn, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import ChoiceChips from '@/components/common/ChoiceChips';
import { FormGrid, FormItem } from '@/components/common/form';
import {
  ChipsField,
  DurationField,
  NumberField,
  SwitchField,
  TextField,
} from '@/components/pages/setup/FormControls';
import { datatypeLabel, tablePartLabel } from '@/lib/setup/describe';
import { SETUP_TEXT } from '@/lib/setup/text';
import { type measurementFormSchema, TABLE_PARTS, type TablePart } from '@/lib/validators/setup';

type MeasurementForm = UseFormReturn<
  z.input<typeof measurementFormSchema>,
  unknown,
  z.output<typeof measurementFormSchema>
>;

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

type DecimalChip = '0' | '1' | '2';
const toDecimalChip = (value: unknown): DecimalChip | null =>
  value === 0 || value === 1 || value === 2 ? (String(value) as DecimalChip) : null;

interface MeasurementFieldsProps {
  form: MeasurementForm;
  /** Editing a measurement that already has results: kind and unit are locked (BR-REC-11). */
  locked: boolean;
  /** Editing (the On switch is shown); a new measurement is always On. */
  isEdit: boolean;
}

// The measurement sheet's form (BR-REC-187, 188): name, kind, unit, decimals, better, "please check"
// range, repeat, report table, On, in a grid that has two columns when the dialog is wide. Time hides unit
// and decimals (it is always min:sec, C3) and takes the check range in minutes and seconds (one field
// each), saved as seconds. "Same as the assessment" / "Own repeat" and "Not in a table" / "Put in a
// table" are derived from the values: an own repeat has a unit, a table place has a group. Only plain
// words (BR-REC-126).
export default function MeasurementFields({ form, locked, isEdit }: MeasurementFieldsProps) {
  const control = form.control;
  const datatype = useWatch({ control, name: 'datatype' });
  const intervalUnit = useWatch({ control, name: 'intervalUnit' });
  const tableGroup = useWatch({ control, name: 'tableGroup' });
  const isTime = datatype === 'duration';
  const ownRepeat = intervalUnit !== null;
  const inTable = tableGroup !== null;

  // The check range and unit mean something else for the other kind, so they start empty again.
  const onKindPick = (kind: 'number' | 'duration') => {
    form.setValue('unit', '');
    form.setValue('decimals', kind === 'number' ? 1 : 0);
    form.setValue('plausibleMin', '');
    form.setValue('plausibleMax', '');
    form.clearErrors(['unit', 'plausibleMin', 'plausibleMax']);
  };
  const onRepeatPick = (pick: 'same' | 'own') => {
    form.setValue('intervalCount', pick === 'own' ? '3' : '');
    form.setValue('intervalUnit', pick === 'own' ? 'month' : null);
    form.clearErrors(['intervalCount', 'intervalUnit']);
  };
  const onReportPick = (pick: 'none' | 'place') => {
    form.setValue('tableGroup', pick === 'place' ? '' : null);
    form.setValue('tablePart', null);
    form.clearErrors(['tableGroup', 'tablePart']);
  };

  return (
    <FormGrid maxCols={2}>
      <TextField control={control} name="name" label={text.name} required />

      {locked ? (
        <FormItem>
          <p className="text-sm font-medium">{text.kind}</p>
          <p className="text-base">{datatypeLabel(datatype)}</p>
          <p className="text-sm text-muted-foreground">{text.kindLocked}</p>
        </FormItem>
      ) : (
        <ChipsField
          control={control}
          name="datatype"
          legend={text.kind}
          required
          options={KIND_OPTIONS}
          onPick={onKindPick}
        />
      )}

      {isTime ? (
        <p className="col-span-full text-sm text-muted-foreground">{text.timeUnit}</p>
      ) : (
        <>
          <TextField control={control} name="unit" label={text.unit} disabled={locked} />
          <ChipsField
            control={control}
            name="decimals"
            legend={text.decimals}
            options={DECIMAL_OPTIONS}
            toChip={toDecimalChip}
            fromChip={Number}
          />
        </>
      )}

      <ChipsField
        control={control}
        name="better"
        legend={text.better}
        options={BETTER_OPTIONS}
        className="col-span-full"
      />

      {isTime ? (
        <>
          <DurationField control={control} name="plausibleMin" label={text.warnBelow} />
          <DurationField control={control} name="plausibleMax" label={text.warnAbove} />
        </>
      ) : (
        <>
          <NumberField
            control={control}
            name="plausibleMin"
            label={text.warnBelow}
            decimals={2}
            allowNegative
          />
          <NumberField
            control={control}
            name="plausibleMax"
            label={text.warnAbove}
            decimals={2}
            allowNegative
          />
        </>
      )}
      <p className="col-span-full text-sm text-muted-foreground">
        {isTime ? text.warnHintTime : text.warnHint}
      </p>

      <FormItem className="col-span-full">
        <ChoiceChips
          legend={text.repeatEvery}
          options={REPEAT_OPTIONS}
          value={ownRepeat ? 'own' : 'same'}
          onChange={onRepeatPick}
        />
      </FormItem>
      {ownRepeat && (
        <>
          <NumberField
            control={control}
            name="intervalCount"
            label={text.ownRepeatNumber}
            required
          />
          <ChipsField
            control={control}
            name="intervalUnit"
            legend={text.weeksOrMonths}
            hideLegend
            options={UNIT_OPTIONS}
          />
        </>
      )}

      <FormItem className="col-span-full">
        <ChoiceChips
          legend={text.reportGroup}
          options={REPORT_OPTIONS}
          value={inTable ? 'place' : 'none'}
          onChange={onReportPick}
        />
      </FormItem>
      {inTable && (
        <>
          <TextField
            control={control}
            name="tableGroup"
            label={text.group}
            hint={text.groupHint}
            required
          />
          <ChipsField
            control={control}
            name="tablePart"
            legend={text.part}
            required
            options={PART_OPTIONS}
          />
        </>
      )}

      {isEdit && (
        <SwitchField control={control} name="isActive" label={text.on} hint={text.onHint} />
      )}
    </FormGrid>
  );
}
