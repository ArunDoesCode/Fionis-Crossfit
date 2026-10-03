import Link, { type LinkProps } from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LinkButtonProps<T extends string> = LinkProps<T> &
  Parameters<typeof buttonVariants>[0] & { className?: string; children?: React.ReactNode };

// A link that looks like a button. `data-slot="button"` makes the global 48 px rule in globals.css apply.
export default function LinkButton<T extends string>({
  variant,
  size,
  className,
  ...props
}: LinkButtonProps<T>) {
  return (
    <Link
      data-slot="button"
      className={cn(buttonVariants({ variant, size: size ?? 'lg' }), className)}
      {...props}
    />
  );
}
