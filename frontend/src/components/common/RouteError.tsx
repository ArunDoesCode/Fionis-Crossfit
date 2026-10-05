'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/common/ErrorState';
import Page from '@/components/common/Page';
import PageHeader from '@/components/common/PageHeader';

// Shared body of every route's `error.tsx` (each of those is `'use client'; export { default } from …`).
// The shell and the page header stay (☰ and back still work); only the content area shows "Couldn't load this." with Try again (BR-REC-131).
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
    <Page>
      <PageHeader />
      <ErrorState onRetry={retry} />
    </Page>
  );
}
