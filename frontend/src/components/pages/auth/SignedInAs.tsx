'use client';

import ErrorState from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/lib/api/auth/queries';
import { UI_TEXT } from '@/lib/messages/words';

// "Signed in as admin" (E05). Its own loading and error state: the rest of the screen keeps working (BR-REC-131).
export default function SignedInAs() {
  const { data, isLoading, isError, refetch } = useMe();

  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div aria-busy="true" role="status" className="flex min-h-11 items-center">
        <span className="sr-only">{UI_TEXT.loading}</span>
        <Skeleton className="h-6 w-48" />
      </div>
    );
  }
  return (
    <p className="flex min-h-11 items-center text-base">
      <span>
        Signed in as <span className="font-semibold">{data.username}</span>
      </span>
    </p>
  );
}
