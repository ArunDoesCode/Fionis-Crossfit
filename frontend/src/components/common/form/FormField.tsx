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
import { Field, FieldDescription, FieldError } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { FieldStateContext, ItemIdsContext, useFieldState, useItemIds } from './fieldContext';

/** RHF `Controller` that also tells FormItem / FormMessage which field this is and what its error is. */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TTransformedValues = TFieldValues,
>({ render, ...props }: ControllerProps<TFieldValues, TName, TTransformedValues>) {
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

interface FormItemProps extends Omit<React.ComponentProps<'div'>, 'children'> {
  children?: ReactNode;
  /** A sentence under the control; the control is linked to it through aria-describedby. */
  hint?: ReactNode;
  /** An error for a field that is not an RHF field (a standalone control); FormControl and FormMessage show it. */
  error?: string;
  /** Label above the control, for chips, switches and checkboxes (the floating label is the input's own). */
  label?: ReactNode;
  required?: boolean;
}

/** One field: control + message in a 76 px box, so an error never moves the form (BR-REC-187). */
export function FormItem({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...props
}: FormItemProps) {
  const id = useId();
  const outer = useFieldState();
  const state = error
    ? { name: outer?.name ?? '', error: { type: 'custom', message: error } }
    : outer;
  const ids = { id, messageId: `${id}-message`, hintId: hint ? `${id}-hint` : undefined };
  return (
    <ItemIdsContext value={ids}>
      <FieldStateContext value={state}>
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
          {hint ? (
            <FieldDescription id={ids.hintId} className="text-xs">
              {hint}
            </FieldDescription>
          ) : null}
        </Field>
      </FieldStateContext>
    </ItemIdsContext>
  );
}

/** Gives the single child control the item's id and the invalid / described-by attributes. */
export function FormControl({ children }: { children: ReactElement<Record<string, unknown>> }) {
  const ids = useItemIds();
  const error = useFieldState()?.error;
  const child = Children.only(children);
  if (!isValidElement(child)) return child;
  const describedBy = [child.props['aria-describedby'], ids?.hintId, error ? ids?.messageId : null]
    .filter(Boolean)
    .join(' ');
  return cloneElement(child, {
    id: child.props.id ?? ids?.id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  });
}

/** The field's error text, inside the FormItem (its height is already reserved). */
export function FormMessage({ error, className }: { error?: string; className?: string }) {
  const fieldMessage = useFieldState()?.error?.message;
  const message = error ?? fieldMessage;
  const ids = useItemIds();
  return (
    <FieldError id={ids?.messageId} className={cn('leading-tight', className)}>
      {message}
    </FieldError>
  );
}
