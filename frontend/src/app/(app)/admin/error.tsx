'use client';

import { useEffect } from 'react';
import ErrorComponent from '@/components/common/ErrorComponent';

export default function AdminError({
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
    <main className="p-6">
      <ErrorComponent onRetry={retry} />
    </main>
  );
}
