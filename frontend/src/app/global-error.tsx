'use client';

import './globals.css';

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    // global-error replaces the root layout, so it renders its own <html>/<body>.
    <html lang="en">
      <body className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-medium">Something went wrong</h1>
        <button
          type="button"
          className="rounded-md border px-4 py-2 text-sm"
          onClick={() => retry()}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
