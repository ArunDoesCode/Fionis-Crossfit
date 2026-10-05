import type { Route } from 'next';
import Link from 'next/link';

interface TableRowLinkProps<T extends string> {
  href: Route<T>;
  children: React.ReactNode;
}

// The one link of a table row (BR-REC-183): its click area is stretched over the whole row (DataTable rows
// are `relative`), so the whole row opens the page. Controls beside it need `relative z-10`.
export default function TableRowLink<T extends string>({ href, children }: TableRowLinkProps<T>) {
  return (
    <Link
      href={href}
      className="font-medium outline-none before:absolute before:inset-0 before:rounded-md focus-visible:underline focus-visible:before:ring-2 focus-visible:before:ring-ring"
    >
      {children}
    </Link>
  );
}
