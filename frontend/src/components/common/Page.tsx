import { cn } from '@/lib/utils';

interface PageProps {
  /** `narrow` = forms and detail pages (720 px), `wide` = lists and reports (1080 px). BR-REC-139. */
  width?: 'narrow' | 'wide';
  className?: string;
  children: React.ReactNode;
}

// Centres the screen on desktop and gives it the page padding (16 px phone, 24 px desktop).
// Sections inside are 24 px apart.
export default function Page({ width = 'wide', className, children }: PageProps) {
  return (
    <div
      className={cn(
        'section-gap page-px mx-auto flex w-full flex-col pb-6',
        width === 'narrow'
          ? 'max-w-[calc(720px+2*var(--page-padding))]'
          : 'max-w-[calc(1080px+2*var(--page-padding))]',
        className,
      )}
    >
      {children}
    </div>
  );
}
