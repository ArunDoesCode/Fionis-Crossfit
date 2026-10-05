import { cn } from '@/lib/utils';

interface PageProps {
  className?: string;
  children: React.ReactNode;
}

// The whole content area with p-4 on every side and the section gap (BR-REC-181, 182). On phones the top
// edge is the sticky top bar, so there is no top padding there.
export default function Page({ className, children }: PageProps) {
  return (
    <div className={cn('section-gap flex w-full flex-col p-4 max-md:pt-0', className)}>
      {children}
    </div>
  );
}
