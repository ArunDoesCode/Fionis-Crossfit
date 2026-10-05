import { cn } from '@/lib/utils';

interface PageProps {
  /** `narrow` = forms and detail pages (896 px), `wide` = lists, reports and Record assessment (1280 px). BR-REC-182. */
  width?: 'narrow' | 'wide';
  className?: string;
  children: React.ReactNode;
}

// Centres the screen and gives it the page padding and section gap from the density tokens (BR-REC-181).
export default function Page({ width = 'wide', className, children }: PageProps) {
  return (
    <div
      className={cn(
        'section-gap page-px mx-auto flex w-full flex-col pb-page',
        width === 'narrow' ? 'page-narrow' : 'page-wide',
        className,
      )}
    >
      {children}
    </div>
  );
}
