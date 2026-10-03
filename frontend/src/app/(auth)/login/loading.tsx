import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Skeleton className="h-28 w-full max-w-sm rounded-xl" />
    </main>
  );
}
