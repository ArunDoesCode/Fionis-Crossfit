import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-medium">Page not found</h1>
      <p className="text-sm text-muted-foreground">This page does not exist.</p>
      <Link href="/admin" className={buttonVariants({ variant: 'secondary' })}>
        Back to admin
      </Link>
    </main>
  );
}
