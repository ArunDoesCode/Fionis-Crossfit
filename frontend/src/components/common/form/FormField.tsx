'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useId,
} from 'react';
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { Field, FieldError } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { FieldStateContext, ItemIdsContext, useFieldState, useItemIds } from './fieldContext';

/** RHF `Controller` that also tells FormItem / FormMessage which field this is and what its error is. */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ render, ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <Controller
      {...props}
      render={(args) => (
        <FieldStateContext value={{ name: props.name, error: args.fieldState.error }}>
          {render(args)}
        </FieldStateContext>
      )}
    />
  );
}

interface FormItemProps extends React.ComponentProps<'div'> {
  /** Label above the control, for chips, switches and checkboxes (the floating label is the input's own). */
  label?: ReactNode;
  required?: boolean;
}

/** One field: control + message in a 76 px box, so an error never moves the form (BR-REC-187). */
export function FormItem({ label, required, className, children, ...props }: FormItemProps) {
  const id = useId();
  const state = useFieldState();
  const ids = { id, messageId: `${id}-message` };
  return (
    <ItemIdsContext value={ids}>
      <Field
        data-field={state?.name}
        data-invalid={state?.error ? true : undefined}
        className={cn('min-h-19 gap-1', className)}
        {...props}
      >
        {label ? (
          <>
            <span id={`${id}-label`} className="text-sm font-medium">
              {label}
              {required ? <span aria-hidden="true"> *</span> : null}
            </span>
            <fieldset aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
              {children}
            </fieldset>
          </>
        ) : (
          children
        )}
      </Field>
    </ItemIdsContext>
  );
}

/** Gives the single child control the item's id and the invalid / described-by attributes. */
export function FormControl({ children }: { children: ReactElement<Record<string, unknown>> }) {
  const ids = useItemIds();
  const error = useFieldState()?.error;
  const child = Children.only(children);
  if (!isValidElement(child)) return child;
  return cloneElement(child, {
    id: child.props.id ?? ids?.id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? ids?.messageId : undefined,
  });
}

/** The field's error text, inside the FormItem (its height is already reserved). */
export function FormMessage({ className }: { className?: string }) {
  const message = useFieldState()?.error?.message;
  const ids = useItemIds();
  return (
    <FieldError id={ids?.messageId} className={cn('leading-tight', className)}>
      {message}
    </FieldError>
  );
}
