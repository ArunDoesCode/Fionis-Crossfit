'use client';

import type { FieldErrors } from 'react-hook-form';
import { firstProblem, SUMMARY_MIN } from '@/lib/forms/firstProblem';
import { focusField } from './useFocusFirstProblem';

interface FormErrorSummaryProps {
  errors: FieldErrors;
  /** Field names in screen order. */
  order: readonly string[];
  /** Link text per field name (the field's label); falls back to the name. */
  labels?: Readonly<Record<string, string>>;
  className?: string;
}

const thingsToFix = (count: number) => `${count} ${count === 1 ? 'thing' : 'things'} to fix`;

/** From SUMMARY_MIN errors: "3 things to fix" with a link to each field (BR-REC-189). */
export function FormErrorSummary({ errors, order, labels = {}, className }: FormErrorSummaryProps) {
  const names = Object.keys(errors);
  if (names.length < SUMMARY_MIN) return null;
  const first = firstProblem(errors, order);
  const sorted = [
    ...order.filter((name) => names.includes(name)),
    ...names.filter((name) => !order.includes(name)),
  ];
  return (
    <div
      role="alert"
      className={
        className ?? 'rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm'
      }
    >
      <p className="font-medium text-destructive">{thingsToFix(names.length)}</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {sorted.map((name) => (
          <li key={name}>
            <button
              type="button"
              data-first={name === first || undefined}
              className="text-left underline underline-offset-4 hover:text-primary"
              onClick={() => focusField(name)}
            >
              {labels[name] ?? name}
              {typeof errors[name]?.message === 'string' ? `: ${errors[name]?.message}` : ''}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
