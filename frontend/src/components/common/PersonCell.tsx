import type { Route } from 'next';
import MemberAvatar from '@/components/common/MemberAvatar';
import TableRowLink from '@/components/common/TableRowLink';

interface PersonCellProps<T extends string> {
  name: string;
  href: Route<T>;
}

// The name column of a people table (BR-REC-223, 226): initials avatar, then the name (600) as the row's link.
export default function PersonCell<T extends string>({ name, href }: PersonCellProps<T>) {
  return (
    <span className="flex items-center gap-3">
      <MemberAvatar name={name} size="sm" />
      <TableRowLink href={href}>{name}</TableRowLink>
    </span>
  );
}
