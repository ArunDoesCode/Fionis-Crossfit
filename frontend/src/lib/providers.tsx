'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/sonner';
import { getQueryClient } from '@/lib/queryClient';

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter>
        {children}
        <Toaster position="top-center" duration={4000} visibleToasts={2} />
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
