'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';

// Shared body of every route's `error.tsx` (each of those is `'use client'; export { default } from …`).
// The shell stays; only the content area shows "Couldn't load this." with Try again (BR-REC-131).
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Page width="narrow">
      <ErrorState onRetry={retry} />
    </Page>
  );
}
