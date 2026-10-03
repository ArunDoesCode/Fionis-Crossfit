import { Skeleton } from '@/components/ui/skeleton';
import { UI_TEXT } from '@/lib/messages/words';

// The Login card in grey (BR-REC-129): title, two 48 px fields, the tick line, the button.
export default function Loading() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div
        aria-busy="true"
        role="status"
        className="flex w-full max-w-[400px] flex-col gap-6 rounded-2xl p-6 ring-1 ring-foreground/10"
      >
        <span className="sr-only">{UI_TEXT.loading}</span>
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-12 w-full" />
      </div>
    </main>
  );
}
