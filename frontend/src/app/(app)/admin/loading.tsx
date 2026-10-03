import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="p-6">
      <Skeleton className="h-28 w-full max-w-md rounded-xl" />
    </main>
  );
}
