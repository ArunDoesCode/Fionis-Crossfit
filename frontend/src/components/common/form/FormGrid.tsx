import { FieldLegend, FieldSet } from '@/components/ui/field';
import { cn } from '@/lib/utils';

// Columns follow the form's own width (container query), not the window (BR-REC-188): 1 below ~480 px,
// then 2, 3, 4; a cell is never narrower than 240 px.
const COLUMNS = {
  1: '',
  2: '@[30rem]:grid-cols-2',
  3: '@[30rem]:grid-cols-2 @[45rem]:grid-cols-3',
  4: '@[30rem]:grid-cols-2 @[45rem]:grid-cols-3 @[60rem]:grid-cols-4',
} as const;

interface FormGridProps extends React.ComponentProps<'div'> {
  /** Most columns this form may use (default 4). */
  maxCols?: keyof typeof COLUMNS;
}

export function FormGrid({ maxCols = 4, className, ...props }: FormGridProps) {
  return (
    <div className="@container w-full">
      <div
        className={cn('grid grid-cols-1 gap-x-4 gap-y-2', COLUMNS[maxCols], className)}
        {...props}
      />
    </div>
  );
}

interface FormSectionProps extends React.ComponentProps<'fieldset'> {
  title: string;
}

/** A titled group of related fields; spans every column of the grid. */
export function FormSection({ title, className, children, ...props }: FormSectionProps) {
  return (
    <FieldSet className={cn('col-span-full gap-2', className)} {...props}>
      <FieldLegend variant="label" className="mb-0 text-muted-foreground">
        {title}
      </FieldLegend>
      {children}
    </FieldSet>
  );
}
